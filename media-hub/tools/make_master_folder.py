#!/usr/bin/env python3
"""make_master_folder.py - create the empty "Media Hub Library" master folder on disk (phone or computer).

    python3 make_master_folder.py ~/storage/shared            # Termux: creates ~/storage/shared/Media Hub Library/...
    python3 make_master_folder.py ~/Documents --name "My Library"

It only creates folders and a README. Nothing is moved, copied or deleted, and existing folders and files are left alone.
Drop files into the subfolders, then either link the folder in Media Hub (Folders > Sources > Linked folders) or share it with
    python3 media_serve.py --dir <app folder> --library "<path>/Media Hub Library"
Files inside AI/Generated, AI/Sourced, AI/Provided ... are filed into the matching AI folder automatically; Inbox goes to Inbox.
"""
import argparse, os, sys

TREE = ["Inbox", "Photos", "Videos", "GIFs", "Audio",
        "AI/Generated", "AI/Edited & enhanced", "AI/Sourced", "AI/Provided", "AI/Prompts & references",
        "Sources/This device", "Sources/Gallery originals", "Sources/Google Drive", "Sources/Web saves",
        "Sources/Camera", "Sources/Screenshots", "Sources/Downloads", "Sources/Shared to me",
        "My folders", "Collections"]
README = """Media Hub Library
=================
Your master folder. Every subfolder is just a folder: put anything in any of them.

AI/          anything an AI made (Generated), changed (Edited & enhanced), found (Sourced) or handed over (Provided),
             plus Prompts & references. Media Hub files these into the matching AI folder automatically.
Inbox/       things waiting to be filed
Photos, Videos, GIFs, Audio/   your own files by type
Sources/     where things came from: Camera, Screenshots, Downloads, Google Drive, Web saves, Shared to me
My folders/  your own folders, as deep as you like
Collections/ exports of collections

Open it in Media Hub: Folders > Sources > Linked folders > Link a folder (Chrome/Edge), or share it read-only with
tools/media_serve.py --library "<this folder>" and open Folders > Sources > Phone folders.
Media Hub never changes, moves or recompresses anything in here.
"""


def make(dest, name="Media Hub Library"):
    root = os.path.join(os.path.expanduser(dest), name)
    made = []
    for rel in TREE:
        p = os.path.join(root, *rel.split("/"))
        if not os.path.isdir(p):
            os.makedirs(p, exist_ok=True); made.append(rel)
    rd = os.path.join(root, "README.txt")
    if not os.path.exists(rd):
        with open(rd, "w", encoding="utf-8") as f: f.write(README)
        made.append("README.txt")
    return root, made


def main():
    ap = argparse.ArgumentParser(description="Create the empty Media Hub Library master folder")
    ap.add_argument("dest", help="where to create it, e.g. ~/storage/shared or ~/Documents")
    ap.add_argument("--name", default="Media Hub Library")
    a = ap.parse_args()
    if not os.path.isdir(os.path.expanduser(a.dest)):
        sys.exit("Not a folder: %s" % a.dest)
    root, made = make(a.dest, a.name)
    print("Master folder:", root)
    print("Created:", ", ".join(made) if made else "nothing new (it was already complete)")
    print("Next: link it in Media Hub (Folders > Sources > Linked folders) or run media_serve.py --library \"%s\"" % root)


if __name__ == "__main__":
    main()
