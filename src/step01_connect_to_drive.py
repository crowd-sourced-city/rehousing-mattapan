from pathlib import Path

def find_google_drive():
    home = Path.home()

    # Common Google Drive mount locations
    possible_paths = [
        home / "My Drive",  # Linux or custom mount
        home / "Google Drive",  # Older macOS installations
        home / "Library/CloudStorage",  # macOS
        Path("G:/My Drive"),  # Windows
        Path("H:/My Drive"),  # Alternative Windows drive
    ]

    # Check common locations
    for path in possible_paths:
        if path.name == "CloudStorage":
            matches = list(path.glob("GoogleDrive*/My Drive"))
            if matches:
                return matches[0]

        if path.exists() and path.is_dir():
            if path.name == "My Drive":
                return path

            # Check for nested My Drive
            nested = path / "My Drive"
            if nested.exists():
                return nested

    # Search other Windows drive letters
    for letter in "CDEFGHIJKLMNOPQRSTUVWXYZ":
        path = Path(f"{letter}:/My Drive")
        if path.exists():
            return path

    raise FileNotFoundError(
        "Google Drive not found. Make sure Google Drive is mounted "
        "and accessible through your filesystem."
    )