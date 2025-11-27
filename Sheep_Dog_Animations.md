# Dog Model Animations

## Overview

The sheepdog models contain 113 animations with 171 animation channels each, targeting translation, scale, and rotation properties.

**Models**: `assets/models/Jep.glb`, `Pip.glb`, `Shiloh.glb`

## Animation Categories

| Category | Count | Examples |
|----------|-------|----------|
| Idle & Poses | 10 | Idle_1 through Idle_7, A_Pose |
| Walking | 6 | Walk_F_IP, Walk_B_IP, Walk_L_IP, Walk_R_IP |
| Trotting | 3 | Trot_F_IP, Trot_L_IP, Trot_R_IP |
| Running | 6 | Run_F_IP, RunFast_F_IP, etc. |
| Turning | 4 | Turn_L_IP, Turn_R_IP, Turn_L180_IP |
| Jumping | 18 | Jump_F_IP, JumpAir_high, JumpLand, etc. |
| Combat | 10 | Attack_Bite, Attack_F, Hit_B, Death_L |
| Crouching | 12 | Crouch_Idle_*, Crouch_F_IP, etc. |
| Sitting | 4 | Sitting_start, Sitting_loop_*, Sitting_end |
| Lying | 8 | Lie_start, Lie_loop_*, Lie_belly_* |
| Sleep | 6 | Lie_Sleep_*, Lie_belly_sleep_* |
| Swimming | 10 | Swim_F_IP, Swim_idle, Swim_Turn_* |
| Behavioral | 8 | Bark, Scratching, Digging_*, Pick_up |
| Eating/Drinking | 5 | EatDrink_start, Eat_loop, Drink_loop |

## Key Animations Used

### Movement (In-Place)
- `Walk_F_IP` - Walk forward (1.00s)
- `Run_F_IP` - Run forward (0.50s)
- `RunFast_F_IP` - Sprint forward (0.50s)
- `Trot_F_IP` - Trot forward (0.67s)

### Idle
- `Idle_1` through `Idle_7` - Various idle poses (4-8s each)

### Actions
- `Bark` - Barking animation (4.58s)
- `Sitting_start/loop/end` - Sit sequence

## Technical Details

- **Format**: GLB (Binary glTF 2.0)
- **Animation Channels**: 171 per animation
- **Target Properties**: translation, scale, rotation
- **Bone Count**: 59 nodes
- **Mesh**: Single mesh with ~9,700 vertices

## Usage Notes

- All movement animations use `_IP` suffix (In Place)
- Animations designed for seamless looping
- Model supports animation blending between states
- `_start`, `_loop`, `_end` suffixes indicate sequenced animations
