import shutil
from pathlib import Path

def clean_up_directory(folder_path: Path):
    """
    Delete all files and folders in the specified directory.

    Args:
        folder_path (Path): The path to the directory to clean up.
    """
    folder_path = Path(folder_path).expanduser()

    # Loop through all immediate files and folders inside the directory
    for item in folder_path.iterdir():
        try:
            if item.is_file() or item.is_symlink():
                item.unlink()  # Deletes files and links
            elif item.is_dir():
                shutil.rmtree(item)  # Deletes folders and all their contents
        except Exception as e:
            print(f"Failed to delete {item}. Reason: {e}")
