#!/usr/bin/env bash
# grant_all.sh: make every permission the AI User Extension needs, through Shizuku, in one run.
#
#   bash grant_all.sh                    # dry run: print what would change, change nothing
#   bash grant_all.sh --apply            # do it
#   bash grant_all.sh --undo --apply     # take it all back
#   bash grant_all.sh --companion PKG --portal PKG   # name the apps if auto-detection picks wrong
#
# Needs: Shizuku running, and its `rish` exported into Termux (Shizuku > Use Shizuku in terminal apps).
# Runs as the ADB shell user through rish. Touches only Termux, the companion app and Mobilerun Portal.
# Package and service names are discovered on the phone, never guessed. Existing accessibility services
# are kept (the Portal entry is added, not substituted). The active keyboard is NOT switched: Portal's
# keyboard is only enabled, and is selected when typing needs it.
# Every step reports OK or FAILED and carries on; failures are listed at the end with the manual fallback.
set -u

APPLY=0; UNDO=0; COMPANION=""; PORTAL=""; TERMUX="com.termux"
while [ $# -gt 0 ]; do
  case "$1" in
    --apply) APPLY=1 ;;
    --undo) UNDO=1 ;;
    --companion) COMPANION="${2:-}"; shift ;;
    --portal) PORTAL="${2:-}"; shift ;;
    --termux) TERMUX="${2:-}"; shift ;;
    -h|--help) sed -n '2,13p' "$0"; exit 0 ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
  shift
done

RISH="${RISH:-rish}"
FAILED=()
say() { printf '%s\n' "$*"; }

sh_() {  # run one shell-user command through rish (read-only queries run even in dry run)
  "$RISH" -c "$1" 2>/dev/null
}

step() {  # step "description" "command" "manual fallback"
  local what="$1" cmd="$2" manual="${3:-}"
  if [ "$APPLY" -eq 0 ]; then
    say "  would: $what"
    say "         rish -c '$cmd'"
    return 0
  fi
  if out=$("$RISH" -c "$cmd" 2>&1) && ! printf '%s' "$out" | grep -qiE 'exception|error|not allowed|denied|unknown'; then
    say "  OK     $what"
  else
    say "  FAILED $what${out:+ ($(printf '%s' "$out" | head -1))}"
    FAILED+=("$what${manual:+  ->  by hand: $manual}")
  fi
}

# ------------------------------------------------------------------ checks
if ! command -v "$RISH" >/dev/null 2>&1; then
  say "rish not found. In Shizuku: Use Shizuku in terminal apps > Export, then follow its steps." >&2
  exit 3
fi
who=$(sh_ "id -u")
if [ "$who" != "2000" ]; then
  say "rish is not running as the shell user (got '${who:-nothing}'). Is Shizuku started, and is Termux allowed in Shizuku?" >&2
  exit 3
fi
sdk=$(sh_ "getprop ro.build.version.sdk"); sdk=${sdk:-0}
say "Android SDK $sdk, running as the shell user through Shizuku."

pkgs=$(sh_ "pm list packages" | sed 's/^package://')
has() { printf '%s\n' "$pkgs" | grep -qx "$1"; }
if [ -z "$PORTAL" ]; then
  PORTAL=$(printf '%s\n' "$pkgs" | grep -iE 'droidrun|mobilerun' | grep -i portal | head -1)
fi
if [ -z "$COMPANION" ]; then
  COMPANION=$(printf '%s\n' "$pkgs" | grep -iE 'automationforge|automation\.forge|forge' | head -1)
fi

components() {  # components <intent action> <package>: services in <package> answering <action>
  sh_ "cmd package query-services --components -a $1" | tr -d '\r' | grep -E "^$2/" | head -5
}

if [ "$UNDO" -eq 1 ]; then say "Mode: UNDO"; fi
if [ "$APPLY" -eq 0 ]; then say "Mode: DRY RUN (nothing changes). Add --apply to make these changes."; fi

# ------------------------------------------------------------------ Termux
say ""
say "Termux ($TERMUX)"
if has "$TERMUX"; then
  if [ "$UNDO" -eq 0 ]; then
    step "exempt Termux from battery optimisation" "dumpsys deviceidle whitelist +$TERMUX"
    if [ "$sdk" -ge 32 ]; then
      step "stop Android killing Termux's background processes (phantom process killer)" \
           "settings put global settings_enable_monitor_phantom_procs false" \
           "Developer options > Disable child process restrictions"
    elif [ "$sdk" -eq 31 ]; then
      step "stop Android 12 killing Termux's background processes" \
           "device_config set_sync_disabled_for_tests persistent && device_config put activity_manager max_phantom_processes 2147483647"
    fi
  else
    step "restore Termux battery optimisation" "dumpsys deviceidle whitelist -$TERMUX"
    [ "$sdk" -ge 32 ] && step "restore the phantom process killer" "settings put global settings_enable_monitor_phantom_procs true"
  fi
  # Let the companion app run Termux commands (RUN_COMMAND). This is a Termux file, not a phone setting.
  props="$HOME/.termux/termux.properties"
  if [ "$UNDO" -eq 0 ] && ! grep -qs '^allow-external-apps *= *true' "$props"; then
    if [ "$APPLY" -eq 1 ]; then
      mkdir -p "$HOME/.termux" && printf '\nallow-external-apps = true\n' >> "$props" && say "  OK     allow other apps to run Termux commands (termux.properties)"
      command -v termux-reload-settings >/dev/null && termux-reload-settings
    else
      say "  would: add 'allow-external-apps = true' to ~/.termux/termux.properties"
    fi
  fi
else
  say "  not installed: skipped"
fi

# ------------------------------------------------------------------ Portal
say ""
say "Mobilerun Portal (${PORTAL:-not found})"
if [ -n "$PORTAL" ] && has "$PORTAL"; then
  a11y=$(components android.accessibilityservice.AccessibilityService "$PORTAL" | head -1)
  current=$(sh_ "settings get secure enabled_accessibility_services"); [ "$current" = "null" ] && current=""
  imes=$(sh_ "ime list -a -s" | grep -E "^$PORTAL/" | head -1)
  if [ "$UNDO" -eq 0 ]; then
    [ "$sdk" -ge 33 ] && step "clear 'restricted settings' for Portal" "appops set $PORTAL ACCESS_RESTRICTED_SETTINGS allow" \
         "Settings > Apps > Portal > three-dot menu > Allow restricted settings"
    if [ -n "$a11y" ]; then
      case ":$current:" in
        *":$a11y:"*) say "  OK     accessibility already on ($a11y)" ;;
        *) new="${current:+$current:}$a11y"
           step "turn on Portal's accessibility service (keeping the ones already on)" \
                "settings put secure enabled_accessibility_services '$new' && settings put secure accessibility_enabled 1" \
                "Settings > Accessibility > Portal > on" ;;
      esac
    else
      say "  no accessibility service found in $PORTAL"; FAILED+=("Portal accessibility service not found  ->  open Portal once, then re-run")
    fi
    [ -n "$imes" ] && step "enable Portal's keyboard (not switched to it)" "ime enable $imes" "Settings > System > Keyboard > On-screen keyboards > Portal"
    step "allow Portal to draw numbered overlays" "appops set $PORTAL SYSTEM_ALERT_WINDOW allow" "Settings > Apps > Portal > Display over other apps"
    step "exempt Portal from battery optimisation" "dumpsys deviceidle whitelist +$PORTAL"
  else
    if [ -n "$a11y" ]; then
      rest=$(printf '%s' "$current" | tr ':' '\n' | grep -vx "$a11y" | paste -sd: -)
      step "turn off Portal's accessibility service (others kept)" "settings put secure enabled_accessibility_services '${rest}'"
    fi
    [ -n "$imes" ] && step "disable Portal's keyboard" "ime disable $imes"
    step "stop Portal drawing overlays" "appops set $PORTAL SYSTEM_ALERT_WINDOW default"
    step "restore Portal battery optimisation" "dumpsys deviceidle whitelist -$PORTAL"
  fi
else
  say "  not installed yet: skipped (install it in Phase 1, then re-run)"
fi

# ------------------------------------------------------------------ companion
say ""
say "Companion app (${COMPANION:-not found})"
if [ -n "$COMPANION" ] && has "$COMPANION"; then
  listener=$(components android.service.notification.NotificationListenerService "$COMPANION" | head -1)
  if [ "$UNDO" -eq 0 ]; then
    [ "$sdk" -ge 33 ] && step "clear 'restricted settings' for the companion app" "appops set $COMPANION ACCESS_RESTRICTED_SETTINGS allow" \
         "Settings > Apps > companion > three-dot menu > Allow restricted settings"
    step "make it the default digital assistant (summon from anywhere, read the screen via the Assist API)" \
         "cmd role add-role-holder android.app.role.ASSISTANT $COMPANION" \
         "Settings > Apps > Default apps > Digital assistant app"
    step "allow the microphone" "pm grant $COMPANION android.permission.RECORD_AUDIO" "allow it when the app asks"
    [ "$sdk" -ge 33 ] && step "allow notifications" "pm grant $COMPANION android.permission.POST_NOTIFICATIONS" "allow it when the app asks"
    [ -n "$listener" ] && step "let it read notifications as context" "cmd notification allow_listener $listener" \
         "Settings > Notifications > Device & app notifications > companion"
    step "allow a floating panel" "appops set $COMPANION SYSTEM_ALERT_WINDOW allow" "Settings > Apps > companion > Display over other apps"
    has "$TERMUX" && step "allow it to run Termux commands" "pm grant $COMPANION com.termux.permission.RUN_COMMAND" \
         "Settings > Apps > companion > Permissions > Additional permissions > Run commands in Termux"
    step "exempt it from battery optimisation" "dumpsys deviceidle whitelist +$COMPANION"
  else
    step "remove it as the default assistant" "cmd role remove-role-holder android.app.role.ASSISTANT $COMPANION"
    [ -n "$listener" ] && step "stop it reading notifications" "cmd notification disallow_listener $listener"
    step "stop the floating panel" "appops set $COMPANION SYSTEM_ALERT_WINDOW default"
    step "restore its battery optimisation" "dumpsys deviceidle whitelist -$COMPANION"
  fi
else
  say "  not installed yet: skipped (it arrives with Phase 3; re-run then)"
fi

# ------------------------------------------------------------------ summary
say ""
if [ "$APPLY" -eq 0 ]; then
  say "Dry run finished. Nothing changed. Run again with --apply to make these changes."
elif [ ${#FAILED[@]} -eq 0 ]; then
  say "All done. Nothing failed."
else
  say "${#FAILED[@]} step(s) failed. Do these by hand:"
  for f in "${FAILED[@]}"; do say "  - $f"; done
  exit 1
fi
