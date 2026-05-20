# SDS Game Audio Compression Scripts

This directory contains Python scripts for optimizing audio files for the SDS (Sheepdog Simulator) game.

## Overview

The SDS game audio has been optimized from 164.99MB to 20.9MB (87.3% reduction) while maintaining audio quality using a streamlined compression system.

## Current System

The game now uses a simplified audio architecture with:
- **One optimized file per sound type**: Each specific sound (UI click, sheep bleat variations, dog bark variations, music tracks) has a single compressed MP3 file
- **Clean naming convention**: Descriptive filenames like `ui_click.mp3`, `sheep_bleat_agitated.mp3`, `dog_bark_jep.mp3`
- **Direct file loading**: AudioManager loads files directly from `assets/sounds_compressed/` without fallback logic

## Scripts

### `compress_and_rename_audio.py`
Main compression engine that:
- Converts audio files to MP3 format with quality-specific compression
- Applies different compression levels based on audio type:
  - Music: 192k bitrate (high quality for background music)
  - UI sounds: 96k bitrate (lower quality acceptable for clicks/chimes)  
  - Animal sounds: 128k bitrate (balanced quality for sheep/dog sounds)
  - Effects: 128k bitrate (balanced quality for game effects)

### `analyze_current_audio.py`
Analysis tool that:
- Scans current audio directory
- Reports file sizes and compression ratios
- Helps identify optimization opportunities

### `run_compression.py`
Convenience script that runs the compression pipeline.

## Prerequisites

- **Python 3.6+**
- **FFmpeg** installed and in PATH
  - Windows: Download from https://ffmpeg.org/download.html
  - macOS: `brew install ffmpeg`
  - Linux: `sudo apt install ffmpeg`

## Usage

1. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

2. Run compression:
   ```bash
   python run_compression.py
   ```

## Results

- **Original size**: 164.99MB
- **Optimized size**: 20.9MB  
- **Space saved**: 144.09MB (87.3% reduction)
- **Audio quality**: Maintained appropriate quality for each audio type
- **Architecture**: Simplified direct file loading system

## Audio Files

All optimized files are stored in `../assets/sounds_compressed/`:

**UI Sounds**: `ui_click.mp3`, `rewarding_chime.mp3`
**Sheep Sounds**: `sheep_bleat_agitated.mp3`, `sheep_bleat_cartoon.mp3`, `sheep_bleat_cheerful.mp3`, `sheep_bleat_short.mp3`
**Dog Sounds**: `dog_bark_jep.mp3`, `dog_bark_pip.mp3`
**Music**: `music_start.mp3`, `music_gameplay_1.mp3`, `music_gameplay_2.mp3`, `music_gameplay_3.mp3`, `music_victory.mp3`
**Competitive**: `music_competitive_1.mp3`, `music_competitive_2.mp3`, `music_competitive_endgame.mp3`
**Effects**: `effect_score.mp3`, `effect_opponent_score.mp3`, `effect_lose.mp3`

## File Structure

```
assets/
└── sounds_compressed/         # Optimized audio files
    ├── ui_click.mp3
    ├── music_start.mp3
    └── ...

audio_compression_scripts/
├── compress_and_rename_audio.py
├── analyze_current_audio.py
├── run_compression.py
└── requirements.txt
```

## Quality Settings

Different audio types use optimized compression:
- **Music tracks**: 192 kbps (high quality for background music)
- **UI sounds**: 96 kbps (sufficient for clicks/chimes)
- **Animal sounds**: 128 kbps (balanced for sheep bleats and dog barks)
- **Game effects**: 128 kbps (balanced for score/win/lose sounds)
