# Entry point for the PyInstaller build of esptool (scripts/build-esptool.mjs).
# Same as running "esptool" from pip; PyInstaller needs a plain script to start from.
from esptool import _main

if __name__ == "__main__":
    _main()
