#!/usr/bin/env python3
"""
Audio Compression and Renaming Script for SDS Game
Compresses all audio files to MP3 format with optimized settings and clean filenames
"""

import os
import json
import subprocess
import shutil
from pathlib import Path
from typing import Dict, List, Tuple

class AudioCompressor:
    def __init__(self, source_dir: str = "../../assets/sounds", output_dir: str = "../../assets/sounds_compressed"):
        self.source_dir = Path(source_dir)
        self.output_dir = Path(output_dir)
        self.backup_dir = Path(output_dir) / "original_backup"
        self.mapping = {}
        
        # Create output directories
        self.output_dir.mkdir(exist_ok=True)
        self.backup_dir.mkdir(exist_ok=True)
        
        # Audio quality settings for different types
        self.quality_settings = {
            'music': '192k',      # High quality for music
            'ui': '96k',          # Lower quality for UI sounds
            'effects': '128k',    # Medium quality for game effects
            'animals': '128k'     # Medium quality for sheep/dog sounds
        }
        
        # Clean filename mappings
        self.clean_names = {
            # UI Sounds
            '11L-clean_UI_click,_wood-1748393658157.mp3': 'ui_click.mp3',
            '11L-short_rewarding_chim-1748393597911.mp3': 'rewarding_chime.mp3',
            
            # Sheep Sounds
            '11L-agitated_sheep_bleat-1748393501154.mp3': 'sheep_bleat_agitated.mp3',
            '11L-Short_sheep_bleat,_c-1749516139042.mp3': 'sheep_bleat_short.mp3',
            '11L-Short_cartoon_sheep_-1749516345212.mp3': 'sheep_bleat_cartoon.mp3',
            '11L-Short,_cheerful_shee-1749516791666.mp3': 'sheep_bleat_cheerful.mp3',
            
            # Dog Sounds
            '11L-short_sharp_sheep_do-1748393459422.mp3': 'dog_bark_jep.mp3',
            'pip_bark.mp3': 'dog_bark_pip.mp3',
            # 'rauri_bark.mp3': 'dog_bark_rauri.mp3',  # Deprecated - renamed to pip
            
            # Music
            'SDS Start Music.wav': 'music_start.mp3',
            'SDS1.wav': 'music_gameplay_1.mp3',
            'SDS2.wav': 'music_gameplay_2.mp3',
            'SDS3.wav': 'music_gameplay_3.mp3',
            'comp1.wav': 'music_competitive_1.mp3',
            'comp2.wav': 'music_competitive_2.mp3',
            'comp_endgame.wav': 'music_competitive_endgame.mp3',
            'win.wav': 'music_victory.mp3',
            
            # Game Effects
            'score.mp3': 'effect_score.mp3',
            'opponent_score.mp3': 'effect_opponent_score.mp3',
            'lose_comp.mp3': 'effect_lose.mp3'
        }
    
    def get_file_category(self, filename: str) -> str:
        """Determine the category of an audio file for quality settings"""
        if filename.startswith('SDS') or filename.startswith('comp') or filename == 'win.wav':
            return 'music'
        elif filename.startswith('11L-clean') or filename.startswith('11L-short_rewarding'):
            return 'ui'
        elif 'sheep' in filename or 'bark' in filename or filename.startswith('11L-short_sharp'):
            return 'animals'
        else:
            return 'effects'
    
    def analyze_file(self, file_path: Path) -> Dict:
        """Analyze an audio file using ffprobe"""
        try:
            cmd = [
                'ffprobe', '-v', 'quiet', '-print_format', 'json', 
                '-show_format', '-show_streams', str(file_path)
            ]
            result = subprocess.run(cmd, capture_output=True, text=True, check=True)
            return json.loads(result.stdout)
        except (subprocess.CalledProcessError, json.JSONDecodeError) as e:
            print(f"Warning: Could not analyze {file_path}: {e}")
            return {}
    
    def compress_file(self, source_path: Path, output_path: Path, quality: str) -> bool:
        """Compress a single audio file to MP3"""
        try:
            cmd = [
                'ffmpeg', '-i', str(source_path),
                '-codec:a', 'libmp3lame',
                '-b:a', quality,
                '-ac', '2',  # Stereo
                '-ar', '44100',  # 44.1kHz sample rate
                '-y',  # Overwrite output files
                str(output_path)
            ]
            
            result = subprocess.run(cmd, capture_output=True, text=True)
            
            if result.returncode == 0:
                return True
            else:
                print(f"Error compressing {source_path}: {result.stderr}")
                return False
                
        except subprocess.CalledProcessError as e:
            print(f"Error compressing {source_path}: {e}")
            return False
    
    def backup_original_files(self):
        """Create backup of original files"""
        print("Creating backup of original files...")
        if self.source_dir.exists():
            for file_path in self.source_dir.glob('*'):
                if file_path.is_file() and file_path.suffix.lower() in ['.mp3', '.wav']:
                    backup_path = self.backup_dir / file_path.name
                    shutil.copy2(file_path, backup_path)
                    print(f"Backed up: {file_path.name}")
    
    def compress_all_files(self) -> Dict[str, str]:
        """Compress all audio files and return mapping"""
        print("Starting audio compression...")
        
        original_total_size = 0
        compressed_total_size = 0
        
        for file_path in self.source_dir.glob('*'):
            if file_path.is_file() and file_path.suffix.lower() in ['.mp3', '.wav']:
                original_size = file_path.stat().st_size
                original_total_size += original_size
                
                # Get clean filename
                clean_name = self.clean_names.get(file_path.name, file_path.stem + '.mp3')
                output_path = self.output_dir / clean_name
                
                # Determine quality based on file category
                category = self.get_file_category(file_path.name)
                quality = self.quality_settings[category]
                
                print(f"Compressing {file_path.name} -> {clean_name} (Quality: {quality}, Category: {category})")
                
                # Analyze original file
                file_info = self.analyze_file(file_path)
                if file_info:
                    format_info = file_info.get('format', {})
                    original_bitrate = format_info.get('bit_rate', 'Unknown')
                    original_duration = format_info.get('duration', 'Unknown')
                    print(f"  Original: {original_bitrate} bps, {original_duration}s, {original_size/1024/1024:.2f}MB")
                
                # Compress the file
                success = self.compress_file(file_path, output_path, quality)
                
                if success and output_path.exists():
                    compressed_size = output_path.stat().st_size
                    compressed_total_size += compressed_size
                    compression_ratio = (1 - compressed_size / original_size) * 100
                    
                    print(f"  Compressed: {compressed_size/1024/1024:.2f}MB ({compression_ratio:.1f}% reduction)")
                    
                    # Store mapping
                    self.mapping[file_path.name] = clean_name
                else:
                    print(f"  Failed to compress {file_path.name}")
        
        total_compression = (1 - compressed_total_size / original_total_size) * 100 if original_total_size > 0 else 0
        print(f"\nCompression Summary:")
        print(f"Original total size: {original_total_size/1024/1024:.2f}MB")
        print(f"Compressed total size: {compressed_total_size/1024/1024:.2f}MB")
        print(f"Total compression: {total_compression:.1f}%")
        
        return self.mapping
    
    def save_mapping(self, mapping: Dict[str, str]):
        """Save the file mapping to JSON"""
        mapping_file = Path('audio_file_mapping.json')
        
        # Create comprehensive mapping including paths
        full_mapping = {
            'file_mapping': mapping,
            'settings': {
                'original_directory': str(self.source_dir),
                'compressed_directory': str(self.output_dir),
                'backup_directory': str(self.backup_dir),
                'quality_settings': self.quality_settings
            },
            'audiomanager_updates': {
                'sound_files': {},
                'sheep_bleat_files': [],
                'dog_bark_files': {},
                'music_files': {}
            }
        }
        
        # Organize by AudioManager categories
        for original_name, clean_name in mapping.items():
            compressed_path = f"assets/sounds_compressed/{clean_name}"
            
            # UI Sounds
            if original_name == '11L-clean_UI_click,_wood-1748393658157.mp3':
                full_mapping['audiomanager_updates']['sound_files']['uiClick'] = compressed_path
            elif original_name == '11L-short_rewarding_chim-1748393597911.mp3':
                full_mapping['audiomanager_updates']['sound_files']['rewardingChime'] = compressed_path
            
            # Game Effects
            elif original_name == 'score.mp3':
                full_mapping['audiomanager_updates']['sound_files']['scoreSound'] = compressed_path
            elif original_name == 'opponent_score.mp3':
                full_mapping['audiomanager_updates']['sound_files']['opponentScoreSound'] = compressed_path
            elif original_name == 'lose_comp.mp3':
                full_mapping['audiomanager_updates']['sound_files']['loseSound'] = compressed_path
            
            # Sheep Sounds
            elif 'sheep' in original_name.lower() or original_name.startswith('11L-Short'):
                full_mapping['audiomanager_updates']['sheep_bleat_files'].append(compressed_path)
            
            # Dog Sounds
            elif 'jep' in clean_name or original_name.startswith('11L-short_sharp'):
                full_mapping['audiomanager_updates']['dog_bark_files']['jep'] = compressed_path
            elif 'pip' in clean_name:
                full_mapping['audiomanager_updates']['dog_bark_files']['pip'] = compressed_path
            # rauri deprecated - renamed to pip
            
            # Music
            elif original_name == 'SDS Start Music.wav':
                full_mapping['audiomanager_updates']['music_files']['startMusic'] = compressed_path
            elif original_name == 'SDS1.wav':
                full_mapping['audiomanager_updates']['music_files']['gameplay1'] = compressed_path
            elif original_name == 'SDS2.wav':
                full_mapping['audiomanager_updates']['music_files']['gameplay2'] = compressed_path
            elif original_name == 'SDS3.wav':
                full_mapping['audiomanager_updates']['music_files']['gameplay3'] = compressed_path
            elif original_name == 'comp1.wav':
                full_mapping['audiomanager_updates']['music_files']['competitive1'] = compressed_path
            elif original_name == 'comp2.wav':
                full_mapping['audiomanager_updates']['music_files']['competitive2'] = compressed_path
            elif original_name == 'comp_endgame.wav':
                full_mapping['audiomanager_updates']['music_files']['competitiveEndgame'] = compressed_path
            elif original_name == 'win.wav':
                full_mapping['audiomanager_updates']['music_files']['winMusic'] = compressed_path
        
        with open(mapping_file, 'w') as f:
            json.dump(full_mapping, f, indent=2)
        
        print(f"Mapping saved to {mapping_file}")
        return full_mapping
    
    def run(self):
        """Run the complete compression process"""
        print("Starting audio compression and renaming process...")
        print(f"Source directory: {self.source_dir}")
        print(f"Output directory: {self.output_dir}")
        
        # Check if ffmpeg is available
        try:
            subprocess.run(['ffmpeg', '-version'], capture_output=True, check=True)
        except (subprocess.CalledProcessError, FileNotFoundError):
            print("Error: ffmpeg is not installed or not in PATH")
            print("Please install ffmpeg first: https://ffmpeg.org/download.html")
            return
        
        # Backup original files
        self.backup_original_files()
        
        # Compress all files
        mapping = self.compress_all_files()
        
        # Save mapping
        full_mapping = self.save_mapping(mapping)
        
        print("\nCompression process completed!")
        print(f"Compressed files are in: {self.output_dir}")
        print(f"Original files backed up to: {self.backup_dir}")
        print("Next step: Run update_audiomanager.py to update the code")
        
        return full_mapping

if __name__ == "__main__":
    compressor = AudioCompressor()
    compressor.run()
