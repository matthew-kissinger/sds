#!/usr/bin/env python3
"""
Analyze current audio files to understand compression potential
"""

import os
import subprocess
import json
from pathlib import Path

class AudioAnalyzer:
    def __init__(self, source_dir: str = "../assets/sounds"):
        self.source_dir = Path(source_dir)
    
    def get_file_info(self, file_path: Path):
        """Get detailed information about an audio file"""
        try:
            cmd = [
                'ffprobe', '-v', 'quiet', '-print_format', 'json',
                '-show_format', '-show_streams', str(file_path)
            ]
            result = subprocess.run(cmd, capture_output=True, text=True, check=True)
            data = json.loads(result.stdout)
            
            format_info = data.get('format', {})
            stream_info = data.get('streams', [{}])[0]
            
            return {
                'filename': file_path.name,
                'size_bytes': file_path.stat().st_size,
                'size_mb': file_path.stat().st_size / (1024 * 1024),
                'duration': float(format_info.get('duration', 0)),
                'bitrate': format_info.get('bit_rate', 'Unknown'),
                'codec': stream_info.get('codec_name', 'Unknown'),
                'sample_rate': stream_info.get('sample_rate', 'Unknown'),
                'channels': stream_info.get('channels', 'Unknown')
            }
        except Exception as e:
            return {
                'filename': file_path.name,
                'size_bytes': file_path.stat().st_size,
                'size_mb': file_path.stat().st_size / (1024 * 1024),
                'error': str(e)
            }
    
    def analyze_all_files(self):
        """Analyze all audio files in the directory"""
        print("Analyzing current audio files...")
        print("=" * 80)
        
        total_size = 0
        files_info = []
        
        for file_path in sorted(self.source_dir.glob('*')):
            if file_path.is_file() and file_path.suffix.lower() in ['.mp3', '.wav']:
                info = self.get_file_info(file_path)
                files_info.append(info)
                total_size += info['size_bytes']
                
                print(f"File: {info['filename']}")
                print(f"  Size: {info['size_mb']:.2f} MB")
                if 'error' not in info:
                    print(f"  Duration: {info['duration']:.2f} seconds")
                    print(f"  Bitrate: {info['bitrate']}")
                    print(f"  Codec: {info['codec']}")
                    print(f"  Sample Rate: {info['sample_rate']} Hz")
                    print(f"  Channels: {info['channels']}")
                else:
                    print(f"  Error: {info['error']}")
                print()
        
        # Summary
        print("=" * 80)
        print("SUMMARY")
        print("=" * 80)
        print(f"Total files: {len(files_info)}")
        print(f"Total size: {total_size / (1024 * 1024):.2f} MB")
        
        # Group by type
        music_files = [f for f in files_info if f['filename'].endswith('.wav') and 
                      (f['filename'].startswith('SDS') or f['filename'].startswith('comp') or f['filename'] == 'win.wav')]
        ui_files = [f for f in files_info if 'UI_click' in f['filename'] or 'rewarding_chim' in f['filename']]
        animal_files = [f for f in files_info if 'sheep' in f['filename'].lower() or 'bark' in f['filename']]
        effect_files = [f for f in files_info if f not in music_files and f not in ui_files and f not in animal_files]
        
        print(f"\nBy category:")
        print(f"Music files: {len(music_files)} ({sum(f['size_bytes'] for f in music_files) / (1024 * 1024):.2f} MB)")
        print(f"UI files: {len(ui_files)} ({sum(f['size_bytes'] for f in ui_files) / (1024 * 1024):.2f} MB)")
        print(f"Animal sounds: {len(animal_files)} ({sum(f['size_bytes'] for f in animal_files) / (1024 * 1024):.2f} MB)")
        print(f"Effect files: {len(effect_files)} ({sum(f['size_bytes'] for f in effect_files) / (1024 * 1024):.2f} MB)")
        
        # Compression estimates
        print(f"\nCompression estimates:")
        music_compressed = sum(f['size_bytes'] for f in music_files) * 0.2  # ~80% reduction for music
        ui_compressed = sum(f['size_bytes'] for f in ui_files) * 0.1  # ~90% reduction for UI
        animal_compressed = sum(f['size_bytes'] for f in animal_files) * 0.3  # ~70% reduction for animals
        effect_compressed = sum(f['size_bytes'] for f in effect_files) * 0.25  # ~75% reduction for effects
        
        total_compressed = music_compressed + ui_compressed + animal_compressed + effect_compressed
        reduction = (1 - total_compressed / total_size) * 100
        
        print(f"Estimated compressed size: {total_compressed / (1024 * 1024):.2f} MB")
        print(f"Estimated reduction: {reduction:.1f}%")
        
        return files_info

if __name__ == "__main__":
    # Check if ffprobe is available
    try:
        subprocess.run(['ffprobe', '-version'], capture_output=True, check=True)
    except (subprocess.CalledProcessError, FileNotFoundError):
        print("Warning: ffprobe not found. Install ffmpeg for detailed analysis.")
        print("Basic file size analysis will be performed instead.\n")
    
    analyzer = AudioAnalyzer()
    analyzer.analyze_all_files()
