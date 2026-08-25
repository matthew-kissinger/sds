# GameBlocks usage

The mobile camera pass reviewed GameBlocks' `PositionFollowCameraRig` and
`PoseFollowCameraRig` as reference implementations. No GameBlocks source module
was copied: Sheepdog Sim already has equivalent basis, smoothing, and camera-rig
contracts. The adopted principle is to keep position and aim smoothing separate
and tune the view profile at the camera boundary, leaving deterministic dog
movement unchanged.

Files using that principle:

- `app/src/camera/viewProfile.ts`
- `app/src/camera/followFraming.ts`
- `app/src/camera/CameraRig.tsx`
