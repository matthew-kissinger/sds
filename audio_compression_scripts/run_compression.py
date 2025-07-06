#!/usr/bin/env python3
"""
Main runner script for the audio compression process
"""

import sys
import subprocess
from pathlib import Path

def check_ffmpeg():
    """Check if ffmpeg is installed"""
    try:
        subprocess.run(['ffmpeg', '-version'], capture_output=True, check=True)
        subprocess.run(['ffprobe', '-version'], capture_output=True, check=True)
        return True
    except (subprocess.CalledProcessError, FileNotFoundError):
        return False

def main():
    print("SDS Game Audio Compression Tool")
    print("=" * 40)
    
    # Check dependencies
    if not check_ffmpeg():
        print("Error: ffmpeg is not installed or not in PATH")
        print("Please install ffmpeg first:")
        print("  - Windows: Download from https://ffmpeg.org/download.html")
        print("  - macOS: brew install ffmpeg")
        print("  - Linux: sudo apt install ffmpeg (Ubuntu/Debian)")
        return 1
    
    print("✓ ffmpeg found")
    
    # Check source directory
    source_dir = Path("../assets/sounds")
    if not source_dir.exists():
        print(f"Error: Source directory {source_dir} not found")
        return 1
    
    print(f"✓ Source directory found: {source_dir}")
    
    # Run analysis
    print("\n1. Analyzing current audio files...")
    try:
        from analyze_current_audio import AudioAnalyzer
        analyzer = AudioAnalyzer()
        analyzer.analyze_all_files()
    except Exception as e:
        print(f"Warning: Analysis failed: {e}")
    
    # Ask for confirmation
    print("\n" + "=" * 40)
    response = input("Proceed with compression? (y/N): ").strip().lower()
    if response != 'y':
        print("Compression cancelled.")
        return 0
    
    # Run compression
    print("\n2. Compressing audio files...")
    try:
        from compress_and_rename_audio import AudioCompressor
        compressor = AudioCompressor()
        mapping = compressor.run()
        
        if not mapping:
            print("Compression failed or no files processed")
            return 1
            
    except Exception as e:
        print(f"Error during compression: {e}")
        return 1
    
    # Ask about updating AudioManager
    print("\n" + "=" * 40)
    response = input("Update AudioManager.js with new file paths? (y/N): ").strip().lower()
    if response == 'y':
        print("\n3. Updating AudioManager.js...")
        try:
            from update_audiomanager import AudioManagerUpdater
            updater = AudioManagerUpdater()
            updater.run()
        except Exception as e:
            print(f"Error updating AudioManager: {e}")
            return 1
    else:
        print("AudioManager.js not updated. You can run update_audiomanager.py later.")
    
    print("\n" + "=" * 40)
    print("Audio compression process completed!")
    print("Next steps:")
    print("1. Test your game to ensure all sounds work correctly")
    print("2. If satisfied, you can remove the original sounds directory")
    print("3. The compressed files are in assets/sounds_compressed/")
    print("4. Original files are backed up in assets/sounds_compressed/original_backup/")
    
    return 0

if __name__ == "__main__":
    sys.exit(main())
