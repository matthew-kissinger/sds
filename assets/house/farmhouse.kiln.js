// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
//
// The walk-in farmhouse. A Kiln program, rendered and revised through
// `kiln render`, exported to assets/house/farmhouse.glb.
//
// WHY THIS IS NOT app/src/scene/farmhouse/. That cluster is a DISTANCE asset:
// at ninety metres the frame gives eight pixels to the metre, so it is authored
// as silhouette, band and colour mass, and every opening in it is one dark panel
// because trim at that range out-details the sheep. This one is the opposite
// brief - the farmer walks up to it and through it - so it spends its budget on
// exactly what that cluster is right to refuse: reveals in a half-metre wall,
// joinery in every window, a door on its hinges, and a room behind it.
//
// IT MATCHES THE SHIPPED FOOTPRINT ON PURPOSE. 18.6 by 8.6, eaves at 5.8 and a
// ridge at 10.7 are HOUSE in app/src/scene/farmhouse/plan.ts. Nothing here
// reproduces that geometry - it is authored fresh for a close read - but the two
// stand in the same box, so the backdrop can be swapped for this one later
// without moving the pad, the cast shadows or the camera's framing.
//
// EVERY MATERIAL IS NAMED AFTER A BAND SET. The game shades through one toon
// ramp whose three band colours are solved backwards through the tone map and
// the post grade (app/src/scene/farmhouse/bands.ts), not through PBR. Kiln
// exports PBR, one material group per material, so the loader re-binds each
// group by NAME to the band set of the same name. The colours below are those
// sets' body bands, which is only so the raw GLB looks approximately right in a
// contact sheet; in game they are replaced outright.

const meta = { name: 'Farmhouse', category: 'architecture', role: 'building' };

// The shipped range, from app/src/scene/farmhouse/plan.ts.
const SPAN_X = 18.6;
const SPAN_Z = 8.6;
const WALL_H = 5.8;
const RIDGE_H = 10.7;
const RISE = RIDGE_H - WALL_H;
/**
 * The eaves projection, and it came down from 1.15 m.
 *
 * On a pitch this steep a horizontal overhang buys itself a vertical drop of
 * `OVERHANG * RISE / ROOF_HALF`, which at 1.15 m was 1.23 m: the eaves edge
 * finished at 4.44 and the first-floor window heads were at 5.05, so the roof
 * hung down half a metre PAST the top of the windows and the whole upper
 * storey disappeared under the slate from any raised camera. A farmhouse eaves
 * is 300-500 mm; this one drops 0.48 m now and clears the heads by 0.17 m.
 */
const OVERHANG = 0.45;

// The slate, and the two numbers everything about the eaves falls out of.
const ROOF_THICK = 0.22;
/** Two centimetres, so the slate's top plane is not coplanar with the wall head. */
const ROOF_LIFT = 0.02;

// Half a metre of wall is the whole reason this asset exists. A reveal is what
// makes a window read as a hole in something rather than a sticker on it, and
// there is no reveal in a 0.15 m wall.
const WALL_T = 0.55;
const FLOOR_T = 0.18;

// Inner faces of the four walls, which everything indoors is measured from.
const IN_X = SPAN_X / 2 - WALL_T / 2;
const IN_Z = SPAN_Z / 2 - WALL_T / 2;

// Ceiling of the ground floor, and the beams under it.
const CEIL = 2.86;
const BEAM_Y = 2.62;

/**
 * THE SECTION, stated once so the elevations cannot disagree with the inside.
 *
 * Ground floor 0 to 2.86: the hall with the fire and the front door, a parlour
 * past the partition. First floor 2.86 to the wall head at 5.8, which is a
 * 2.94 m room: three bedrooms off a landing, reached by the stair through the
 * well. Roof space 5.8 to the ridge, lit by one small light in each gable and
 * reached by a hatch over the landing - a loft, not a storey, which is why it
 * gets a hatch and not a second flight.
 *
 * The windows are placed FROM this and not the other way round. A first-floor
 * sill at 3.5 stands 640 mm over its own floor; a head at 4.85 leaves most of
 * a metre to the wall head. Before this the first floor was a lid you could
 * climb onto and a 4.9 m void over your head, which is what made the elevation
 * promise a storey the section did not have.
 */
const UPPER_FLOOR = CEIL;
const UPPER_CEIL = WALL_H;

function build() {
  const root = createRoot('Farmhouse');

  const limewash = gameMaterial(0xd1bf9f, { roughness: 0.96 });
  limewash.name = 'limewash';
  const slate = gameMaterial(0x7d7167, { roughness: 0.88 });
  slate.name = 'slate';
  const timber = gameMaterial(0x8f7154, { roughness: 0.85 });
  timber.name = 'timber';
  const stone = gameMaterial(0xab917a, { roughness: 0.92 });
  stone.name = 'stone';
  const masonry = gameMaterial(0x8b7a6e, { roughness: 0.92 });
  masonry.name = 'masonry';
  const dark = gameMaterial(0x463c3e, { roughness: 0.9 });
  dark.name = 'opening';
  const lamp = gameMaterial(0xffb04a, {
    roughness: 0.6,
    emissive: 0xffb04a,
    emissiveIntensity: 1.5,
  });
  lamp.name = 'lamp';

  const box = (name, size, at, material, parent, rotation) =>
    createPart(name, boxGeo(size[0], size[1], size[2]), material, {
      position: at,
      parent: parent ?? root,
      ...(rotation ? { rotation } : {}),
    });

  // ------------------------------------------------------------------ shell
  // Walls with real apertures, a floor, two slopes and two gable ends. The
  // helper stamps wall, opening and roof semantics, which is what lets
  // `kiln inspect` lift the roof off for an interior view.
  //
  // The main elevation is `left` (z = -4.3): the long eaves wall, which is the
  // one both gameplay cameras approach in the shipped cluster. Its rhythm is
  // four bays, and the first floor sits over three of them rather than all four
  // - a farmhouse grew, and a facade that lines up everywhere reads as drawn
  // rather than built.
  const shell = createGableShell(
    'House',
    { wall: limewash, roof: slate, floor: timber, gable: limewash },
    {
      spanX: SPAN_X,
      spanZ: SPAN_Z,
      wallHeight: WALL_H,
      rise: RISE,
      ridgeAxis: 'x',
      overhang: OVERHANG,
      thickness: 0.22,
      wallThickness: WALL_T,
      floorThickness: FLOOR_T,
      enterable: true,
      // The helper's own roof bears on the wall CENTRELINES, and this house has
      // half-metre walls: the outer 275 mm of every eaves wall then stood proud
      // of the slate by 313 mm, and the top view showed a cream strip running
      // the length of both long walls. The roof and the two gable triangles are
      // rebuilt below on the OUTER faces instead, so the wall heads finish under
      // the slate the way a wall plate does.
      closedEnds: false,
      openings: [
        // The front, west to east: two windows, the door, one more window.
        { id: 'front-w1', wall: 'left', kind: 'window', offset: -6.4, width: 1.25, height: 1.75, sill: 1.1 },
        { id: 'front-w2', wall: 'left', kind: 'window', offset: -2.5, width: 1.35, height: 1.85, sill: 1 },
        { id: 'front-door', wall: 'left', kind: 'door', offset: 3.5, width: 1.4, height: 2.6 },
        { id: 'front-w3', wall: 'left', kind: 'window', offset: 7.2, width: 1.1, height: 1.6, sill: 1.25 },
        { id: 'front-u1', wall: 'left', kind: 'window', offset: -6.4, width: 1.2, height: 1.35, sill: 3.5 },
        { id: 'front-u2', wall: 'left', kind: 'window', offset: -2.5, width: 1.2, height: 1.35, sill: 3.5 },
        { id: 'front-u3', wall: 'left', kind: 'window', offset: 3.5, width: 1.1, height: 1.25, sill: 3.65 },
        { id: 'front-u4', wall: 'left', kind: 'window', offset: 7.2, width: 1, height: 1.15, sill: 3.7 },
        // The back: a scullery door and three windows, deliberately not a
        // mirror of the front.
        { id: 'back-door', wall: 'right', kind: 'door', offset: -5.1, width: 1.05, height: 2.2 },
        { id: 'back-w1', wall: 'right', kind: 'window', offset: -1.4, width: 1.2, height: 1.6, sill: 1.2 },
        { id: 'back-w2', wall: 'right', kind: 'window', offset: 2.6, width: 1.05, height: 1.45, sill: 1.35 },
        { id: 'back-u1', wall: 'right', kind: 'window', offset: -1.4, width: 1.05, height: 1.2, sill: 3.65 },
        { id: 'back-u2', wall: 'right', kind: 'window', offset: 4.9, width: 1, height: 1.15, sill: 3.7 },
        // The two gable ends. The fire is against the back one, so it takes a
        // single small light beside the breast rather than a pair.
        { id: 'east-w1', wall: 'front', kind: 'window', offset: -1.3, width: 1.25, height: 1.7, sill: 1.15 },
        { id: 'east-u1', wall: 'front', kind: 'window', offset: 1.5, width: 1, height: 1.2, sill: 3.65 },
        { id: 'west-w1', wall: 'back', kind: 'window', offset: 2.4, width: 1, height: 1.4, sill: 1.3 },
      ],
      parent: root,
    },
  );
  shell.roof.root.removeFromParent();

  // The roof, bearing on the outer faces: span plus one wall thickness, so the
  // slate crosses the eaves line exactly where the render stops. The ridge still
  // lands at 10.7 because the rise is unchanged and the bearing line is still
  // the wall head.
  const roofSpanX = SPAN_X + WALL_T;
  const roofSpanZ = SPAN_Z + WALL_T;
  const roof = createGableRoof('Roof', slate, {
    spanX: roofSpanX,
    spanZ: roofSpanZ,
    rise: RISE,
    ridgeAxis: 'x',
    overhang: OVERHANG,
    thickness: ROOF_THICK,
    parent: root,
  });
  roof.root.position.y = WALL_H + ROOF_LIFT;

  /**
   * THE SLAB IS 0.22 THICK MEASURED PERPENDICULAR TO THE PITCH, which is the
   * number the gable triangles below have to be built against. Read off the
   * exported slab: its top plane runs from (z 0, y 10.72) to (z 5.725, y 4.588)
   * and its underside is the same plane shifted by (-0.161, -0.150) - a
   * perpendicular offset of exactly 0.22. Vertically, therefore, the underside
   * sits `ROOF_THICK * hypot(1, run)` below the top, which here is 0.322 m and
   * not 0.22.
   */
  const ROOF_RUN = RISE / (roofSpanZ / 2);
  const ROOF_SINK = ROOF_THICK * Math.hypot(1, ROOF_RUN);

  /**
   * The two gable triangles, and the correction this pass is built around.
   *
   * They used to be handed the roof's own `span` and `rise`, which put their
   * sloping top edge exactly on the slate's TOP plane - both finished at
   * y 10.72 - so a 0.55 m band of limewash lay coplanar with the slate and
   * z-fought it the whole length of the pitch. On screen that was a bright
   * stripe running from ridge to eaves, a hand's breadth in from the verge,
   * and it read as the wall poking through the roof because that is precisely
   * what it was.
   *
   * The triangle is now built to a plane parallel to the roof and `GABLE_BURY`
   * below its top face - inside the slab, touching neither surface. Its base is
   * the wall head, and its half-span follows from where that buried plane
   * crosses it. Nothing is coplanar with anything, and the part of the triangle
   * that is inside the slate is hidden by the slate.
   */
  const GABLE_BURY = 0.2;
  const gableBase = -ROOF_LIFT;
  const gableRise = RISE - GABLE_BURY - gableBase;
  const gableHalf = gableRise / ROOF_RUN;
  const gableLights = {
    positive: [{ id: 'east-loft', offset: 0, bottom: 1.1, width: 0.9, height: 1 }],
    negative: [{ id: 'west-loft', offset: 1.6, bottom: 1.1, width: 0.9, height: 1 }],
  };
  for (const side of ['positive', 'negative']) {
    const end = createGableEndPanel(`House_Gable_${side}`, limewash, {
      span: gableHalf * 2,
      rise: gableRise,
      thickness: WALL_T,
      ridgeAxis: 'x',
      side,
      openings: gableLights[side],
      parent: roof.root,
    });
    end.root.position.set(side === 'positive' ? SPAN_X / 2 : -SPAN_X / 2, gableBase, 0);
  }

  /**
   * THE FOUR CORNERS, and until now there were holes in them.
   *
   * `createGableShell` builds every wall on its CENTRELINE: the long walls run
   * to x +/-9.3 and the end walls to z +/-4.3, while their outer faces are at
   * +/-9.575 and +/-4.575. That leaves a 275 mm square column of nothing at
   * each corner, full height, with a double-lapped overlap beside it - which is
   * the ragged vertical seam where two walls were supposed to meet. One post
   * per corner, a wall thick each way, fills the gap and finishes flush with
   * both outer faces; the overlap it makes with the walls is inside the solid.
   */
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      box(`House_Corner${sx > 0 ? 'E' : 'W'}${sz > 0 ? 'N' : 'S'}`,
        [WALL_T, WALL_H, WALL_T],
        [sx * (SPAN_X / 2), WALL_H / 2, sz * (SPAN_Z / 2)], limewash);
    }
  }

  // ------------------------------------------------------------- joinery
  // One casement, built the way the backdrop cluster is right not to: a frame
  // set back into the reveal, a mullion and transom, a stone sill projecting
  // past the render, and the glass behind all of it.
  //
  // `outward` is which way the wall faces along its own cross axis. `alongX`
  // says whether the wall runs in X (the long eaves walls) or in Z (the gables).
  function casement(name, alongX, along, width, height, sill, outward, glassMaterial) {
    const face = (alongX ? SPAN_Z : SPAN_X) / 2;
    const outer = outward * (face + WALL_T / 2);
    const plane = outer - outward * 0.13;
    const at = (a, y, d) => (alongX ? [a, y, d] : [d, y, a]);
    const sz = (a, y, d) => (alongX ? [a, y, d] : [d, y, a]);
    const mid = sill + height / 2;
    const jamb = 0.1;
    const deep = 0.1;

    for (const side of [-1, 1]) {
      box(`${name}_Jamb${side < 0 ? 'A' : 'B'}`, sz(jamb, height, deep),
        at(along + side * (width / 2 - jamb / 2), mid, plane), timber);
    }
    box(`${name}_Head`, sz(width, jamb, deep),
      at(along, sill + height - jamb / 2, plane), timber);
    box(`${name}_Cill`, sz(width, jamb, deep), at(along, sill + jamb / 2, plane), timber);
    box(`${name}_Mullion`, sz(0.07, height - 2 * jamb, 0.07), at(along, mid, plane), timber);
    box(`${name}_Transom`, sz(width - 2 * jamb, 0.07, 0.07),
      at(along, sill + height * 0.62, plane), timber);
    box(`${name}_Glass`, sz(width - 2 * jamb, height - 2 * jamb, 0.04),
      at(along, mid, plane - outward * 0.05), glassMaterial ?? dark);
    // The stone sill, the one piece that stands proud of the render and so the
    // one that throws a shadow line across the wall under every window.
    box(`${name}_Sill`, sz(width + 0.36, 0.11, 0.46),
      at(along, sill - 0.04, outer - outward * 0.08), stone);
  }

  // The front elevation, and four lamps burning. An upstairs lamp over a dark
  // ground floor reads as the wrong house, so the rule here is that the first
  // floor is only ever lit alongside the ground floor, never instead of it, and
  // the lit bays alternate between the storeys: -6.4 and -2.5 below, 3.5 and
  // 7.2 above. A lit window directly over a lit window makes one bright column
  // and says one room; four spread across the elevation say a house with
  // people in it. Nothing on the gable ends is lit - they take the key almost
  // square on, and glass driven above 1.0 on a sunlit wall is a white rectangle.
  casement('W_FrontA', true, -6.4, 1.25, 1.75, 1.1, -1, lamp);
  casement('W_FrontB', true, -2.5, 1.35, 1.85, 1, -1, lamp);
  casement('W_FrontC', true, 7.2, 1.1, 1.6, 1.25, -1);
  casement('W_FrontUA', true, -6.4, 1.2, 1.35, 3.5, -1);
  casement('W_FrontUB', true, -2.5, 1.2, 1.35, 3.5, -1);
  casement('W_FrontUC', true, 3.5, 1.1, 1.25, 3.65, -1, lamp);
  casement('W_FrontUD', true, 7.2, 1, 1.15, 3.7, -1, lamp);
  // The back.
  casement('W_BackA', true, -1.4, 1.2, 1.6, 1.2, 1);
  casement('W_BackB', true, 2.6, 1.05, 1.45, 1.35, 1);
  casement('W_BackUA', true, -1.4, 1.05, 1.2, 3.65, 1);
  casement('W_BackUB', true, 4.9, 1, 1.15, 3.7, 1);
  // The gable ends.
  casement('W_EastA', false, -1.3, 1.25, 1.7, 1.15, 1, lamp);
  casement('W_EastUA', false, 1.5, 1, 1.2, 3.65, 1);
  casement('W_WestA', false, 2.4, 1, 1.4, 1.3, -1);

  // ---------------------------------------------------------------- the door
  // Hung and standing open. A closed leaf flush in its opening is the same dark
  // rectangle as a window at any distance; a leaf swung back off its hinge is
  // the one thing in this asset that says the building can be entered, and it
  // is the reason the hall behind it had to be built at all.
  const doorX = 3.5;
  const doorW = 1.4;
  const doorH = 2.6;
  const doorZ = -(SPAN_Z / 2 - WALL_T / 2) - 0.07;
  const leaf = createRoot('FrontDoor');
  leaf.position.set(doorX - doorW / 2 + 0.03, 0, doorZ);
  // Forty degrees, swung inward. At sixty-two the leaf stood almost square to
  // the approach and read as a strip of nothing from the yard; at forty its face
  // is visible from outside and the hall is still open behind it.
  leaf.rotation.y = (-40 * Math.PI) / 180;
  root.add(leaf);
  // Five boards and two ledges, hung off the hinge stile at local x = 0.
  const leafW = doorW - 0.06;
  for (let plank = 0; plank < 5; plank++) {
    box(`Door_Board${plank}`, [leafW / 5 - 0.012, doorH - 0.08, 0.055],
      [leafW / 10 + (plank * leafW) / 5, (doorH - 0.08) / 2, 0], timber, leaf);
  }
  for (const y of [0.45, doorH - 0.55]) {
    box(`Door_Ledge${y < 1 ? 'Low' : 'High'}`, [leafW - 0.06, 0.16, 0.045],
      [leafW / 2, y, -0.045], timber, leaf);
  }
  createPart('Door_Ring', cylinderGeo(0.075, 0.075, 0.022, 10), dark, {
    position: [leafW - 0.18, 1.08, 0.05],
    rotation: [90, 0, 0],
    parent: leaf,
  });
  // The frame the leaf hangs in, and the threshold it swings over.
  for (const side of [-1, 1]) {
    box(`Door_Post${side < 0 ? 'A' : 'B'}`, [0.12, doorH + 0.06, 0.14],
      [doorX + side * (doorW / 2 - 0.06), (doorH + 0.06) / 2, doorZ], timber);
  }
  box('Door_Lintel', [doorW + 0.24, 0.2, 0.3], [doorX, doorH + 0.09, doorZ - 0.05], timber);
  box('Door_Threshold', [doorW + 0.3, 0.09, 0.62], [doorX, 0.03, doorZ - 0.16], stone);

  // ---------------------------------------------------------------- porch
  // A gabled porch over the door: a second roof pitch crossing the first at the
  // one point the eye already goes, and a metre and a half of covered ground to
  // stand on while the door is opened.
  const porchZ = -(SPAN_Z / 2 + WALL_T / 2);
  const porchOut = 2.05;
  const porchHalf = 1.38;
  const porchEaves = 2.78;
  const porchApex = 3.82;
  const porchNose = 0.28;
  box('Porch_Step', [doorW + 1.1, 0.12, 0.72], [doorX, 0.06, porchZ - 0.36], stone);
  for (const side of [-1, 1]) {
    box(`Porch_Post${side < 0 ? 'A' : 'B'}`,
      [0.15, porchEaves + 0.2, 0.15],
      [doorX + side * (porchHalf - 0.13), (porchEaves + 0.2) / 2, porchZ - porchOut + 0.17], timber);
  }
  // The two slopes. Rotated about their own eave so the slab keeps a thickness
  // rather than being a plane with a lit side and a black one.
  const porchRun = Math.hypot(porchHalf + 0.18, porchApex - porchEaves);
  const porchTilt = (Math.atan2(porchApex - porchEaves, porchHalf + 0.18) * 180) / Math.PI;
  for (const side of [-1, 1]) {
    box(`Porch_Slope${side < 0 ? 'A' : 'B'}`,
      [porchRun, 0.14, porchOut + porchNose],
      [doorX + side * (porchHalf + 0.18) / 2, (porchEaves + porchApex) / 2,
        porchZ - (porchOut + porchNose) / 2 + 0.06],
      // Negative: a rotation about +Z takes local +X toward +Y, so the slope on
      // the +X side needs the opposite sign to fall outward. With the sign the
      // other way round the first contact sheet drew the porch as two wings
      // rising off a low centre.
      slate, root, [0, 0, -side * porchTilt]);
  }
  // The tympanum under them.
  createPart('Porch_Tympanum',
    triangleGable(porchHalf + 0.18, porchApex - porchEaves, 0.1), timber, {
      position: [doorX, porchEaves, porchZ - porchOut],
      parent: root,
    });

  // ------------------------------------------------------------- the stack
  // Over the fire, through the camera-side slope, and the same proportion the
  // backdrop's stack settled on: wider above the slate than it is tall.
  // The slate at the stack's centre line stands at 9.16 m: the ridge is 10.7 at
  // z = 0 and the eave 5.8 at z = -4.3, so the shoulder course goes there and
  // the shaft has to be continuous from the breast to the cap. It was not, and
  // the cap and pot floated two and a half metres clear of it in the first
  // contact sheet - which is the kind of thing six orthographic views catch in
  // one call and an orbiting camera in a game lab does not.
  const stackX = -8.1;
  const stackZ = -1.35;
  const stackTop = 11.35;
  box('Stack_Shaft', [2.8, stackTop - 2.6, 2.5], [stackX, (2.6 + stackTop) / 2, stackZ], masonry);
  box('Stack_Shoulder', [3.06, 0.44, 2.76], [stackX, 9.16, stackZ], masonry);
  box('Stack_Cap', [3.02, 0.3, 2.72], [stackX, stackTop + 0.13, stackZ], masonry);
  box('Stack_Pot', [0.78, 0.64, 0.7], [stackX + 0.26, stackTop + 0.6, stackZ - 0.1], masonry);

  // ------------------------------------------------------------- interior
  // One partition, which is all it takes to turn a shed with windows into a
  // house: a hall with the fire and the front door in it, and a parlour at the
  // east end.
  //
  // IT IS AT 5.6 AND NOT AT 1. On the centre line it stood between the front
  // door at 3.5 and the hearth at the west gable, so walking in put a wall
  // across the room the door is for. Whatever else a plan does, the door and
  // the fire belong in the same room.
  const PARTITION_X = 5.6;
  const partition = wallWithOpening('Partition', limewash, {
    length: IN_Z * 2,
    height: CEIL,
    thickness: 0.2,
    axis: 'z',
    openings: [{ kind: 'door', offset: -2.5, width: 1.05, height: 2.1 }],
    parent: root,
  });
  partition.position.set(PARTITION_X, 0, 0);

  // The inglenook, built as two jambs and a head so the firebox is a real
  // recess rather than a dark rectangle painted on a breast.
  const fireZ0 = -3;
  const fireZ1 = 0.6;
  const breastX = -IN_X;
  const breastD = 1.08;
  const mouthZ0 = -2.2;
  const mouthZ1 = -0.2;
  const mouthH = 1.66;
  const jambCentre = (a, b) => (a + b) / 2;
  box('Fire_JambA', [breastD, CEIL, mouthZ0 - fireZ0],
    [breastX + breastD / 2, CEIL / 2, jambCentre(fireZ0, mouthZ0)], masonry);
  box('Fire_JambB', [breastD, CEIL, fireZ1 - mouthZ1],
    [breastX + breastD / 2, CEIL / 2, jambCentre(mouthZ1, fireZ1)], masonry);
  box('Fire_Head', [breastD, CEIL - mouthH, mouthZ1 - mouthZ0],
    [breastX + breastD / 2, (CEIL + mouthH) / 2, jambCentre(mouthZ0, mouthZ1)], masonry);
  box('Fire_Back', [0.1, mouthH, mouthZ1 - mouthZ0],
    [breastX + 0.05, mouthH / 2, jambCentre(mouthZ0, mouthZ1)], dark);
  // The bressummer: the one timber in the house doing visible work.
  box('Fire_Bressummer', [breastD + 0.14, 0.3, mouthZ1 - mouthZ0 + 0.3],
    [breastX + breastD / 2 + 0.07, mouthH + 0.15, jambCentre(mouthZ0, mouthZ1)], timber);
  box('Fire_Hearth', [1.35, 0.09, mouthZ1 - mouthZ0 + 0.7],
    [breastX + breastD + 0.6, 0.045, jambCentre(mouthZ0, mouthZ1)], stone);
  // Logs and the fire in them. Small flames in a two-metre opening read as a
  // light switch rather than a hearth, so the burn fills most of the firedogs
  // and the logs give it something to be burning.
  for (const dz of [-0.42, 0, 0.42]) {
    box(`Fire_Log${dz}`, [0.62, 0.17, 0.2],
      [breastX + 0.52, 0.14 + Math.abs(dz) * 0.1, jambCentre(mouthZ0, mouthZ1) + dz], timber);
  }
  box('Fire_Burning', [0.66, 0.5, 1.45],
    [breastX + 0.5, 0.3, jambCentre(mouthZ0, mouthZ1)], lamp);

  // Beams, and the boarded ceiling over them with a well left for the stair.
  for (const x of [-7.6, -5.3, -3, 0.4, 3.2, 7.4]) {
    box(`Beam_${x}`, [0.22, 0.28, IN_Z * 2], [x, BEAM_Y, 0], timber);
  }
  const wellX0 = -1.3;
  const wellX1 = 2.45;
  const wellZ0 = 2.85;
  box('Ceiling_Main', [IN_X * 2, 0.12, IN_Z + wellZ0],
    [0, CEIL - 0.06, (-IN_Z + wellZ0) / 2], timber);
  box('Ceiling_Side', [wellX0 + IN_X, 0.12, IN_Z - wellZ0],
    [(-IN_X + wellX0) / 2, CEIL - 0.06, (wellZ0 + IN_Z) / 2], timber);
  box('Ceiling_Past', [IN_X - wellX1, 0.12, IN_Z - wellZ0],
    [(wellX1 + IN_X) / 2, CEIL - 0.06, (wellZ0 + IN_Z) / 2], timber);

  // The stair, twelve solid treads climbing the back wall into the well.
  const treads = 12;
  const going = 0.28;
  const riser = CEIL / treads;
  const stairX0 = -1.2;
  for (let step = 0; step < treads; step++) {
    const top = (step + 1) * riser;
    box(`Stair_Tread${step}`, [going, top, 1.05],
      [stairX0 + going * (step + 0.5), top / 2, IN_Z - 0.56], timber);
  }
  box('Stair_RailPostA', [0.1, 1, 0.1], [stairX0 + 0.2, 0.5 + riser, IN_Z - 1.06], timber);
  box('Stair_RailPostB', [0.1, 1, 0.1], [stairX0 + going * treads - 0.2, CEIL + 0.5, IN_Z - 1.06], timber);
  box('Stair_Rail', [going * treads, 0.09, 0.09],
    [stairX0 + (going * treads) / 2, (riser + CEIL) / 2 + 1, IN_Z - 1.06], timber,
    root, [0, 0, (Math.atan2(CEIL - riser, going * treads) * 180) / Math.PI]);

  // ----------------------------------------------------------- first floor
  // THE STOREY THE ELEVATIONS WERE ALREADY PROMISING. Until now the ceiling
  // slab was the end of the house: you could climb the stair onto a bare lid
  // with a 4.9 m void overhead and eight windows opening onto it. The deck and
  // the stair were right; everything that made the deck a floor was missing.
  //
  // A landing at the head of the stair with a rail round the open well, two
  // partitions making three bedrooms off it, and a ceiling at the wall head so
  // the roof space above is a loft and not the room's own roof. The loft gets a
  // hatch over the landing and no second flight, which is what makes it a loft.
  const RAIL_H = 0.9;
  const landingRail = (name, size, at) =>
    box(name, size, [at[0], UPPER_FLOOR + at[1], at[2]], timber);

  // The well's two open edges. The third is where you step off the stair, and
  // the fourth is the back wall.
  landingRail('Landing_RailSide', [0.09, 0.09, IN_Z - wellZ0], [wellX0, RAIL_H, (wellZ0 + IN_Z) / 2]);
  landingRail('Landing_RailFront', [wellX1 - wellX0, 0.09, 0.09], [(wellX0 + wellX1) / 2, RAIL_H, wellZ0]);
  for (const [tag, x, z] of [['A', wellX0, wellZ0], ['B', wellX1, wellZ0], ['C', wellX0, IN_Z - 0.1]]) {
    landingRail(`Landing_Post${tag}`, [0.1, RAIL_H, 0.1], [x, RAIL_H / 2, z]);
  }

  // Two partitions, clear of the well, making a bedroom at each end and a
  // smaller one over the hall.
  for (const [tag, x] of [['West', -4.1], ['East', 3.4]]) {
    const upper = wallWithOpening(`Upper_Partition${tag}`, limewash, {
      length: IN_Z * 2,
      height: UPPER_CEIL - UPPER_FLOOR,
      thickness: 0.16,
      axis: 'z',
      openings: [{ kind: 'door', offset: 2, width: 0.95, height: 2 }],
      parent: root,
    });
    upper.position.set(x, UPPER_FLOOR, 0);
  }

  // The ceiling, in three pieces so the loft hatch is a hole and not a texture.
  // West of the well, over solid deck. Over the well it would be a hatch
  // opening onto a hole.
  const hatchX0 = -2.5;
  const hatchX1 = -1.7;
  box('Upper_Ceiling_Main', [IN_X * 2, 0.1, IN_Z * 2 - 1.1],
    [0, UPPER_CEIL - 0.05, -0.55], timber);
  box('Upper_Ceiling_WestOfHatch', [hatchX0 + IN_X, 0.1, 1.1],
    [(-IN_X + hatchX0) / 2, UPPER_CEIL - 0.05, IN_Z - 0.55], timber);
  box('Upper_Ceiling_EastOfHatch', [IN_X - hatchX1, 0.1, 1.1],
    [(hatchX1 + IN_X) / 2, UPPER_CEIL - 0.05, IN_Z - 0.55], timber);

  // The furniture, and all it has to do is give the room a scale: a table a
  // person sits at, benches, a settle pulled up to the fire, a dresser.
  const tableX = -4.2;
  const tableZ = 1.5;
  box('Table_Top', [2.7, 0.09, 1.05], [tableX, 0.76, tableZ], timber);
  for (const dx of [-1.15, 1.15]) {
    for (const dz of [-0.4, 0.4]) {
      box(`Table_Leg${dx}${dz}`, [0.11, 0.72, 0.11], [tableX + dx, 0.36, tableZ + dz], timber);
    }
  }
  for (const dz of [-0.78, 0.78]) {
    box(`Bench_Top${dz}`, [2.3, 0.07, 0.34], [tableX, 0.46, tableZ + dz], timber);
    for (const dx of [-0.92, 0.92]) {
      box(`Bench_Leg${dx}${dz}`, [0.08, 0.43, 0.3], [tableX + dx, 0.215, tableZ + dz], timber);
    }
  }
  // Along the back wall rather than across the hearth. Sat where a settle wants
  // to be - pulled up to the fire - its back filled the whole two-metre firebox
  // from the only angle anyone walks in from, and the room read as a chimney
  // breast with a board in front of it.
  const settleX = -6.6;
  box('Settle_Seat', [1.9, 0.08, 0.52], [settleX, 0.46, IN_Z - 0.32], timber);
  box('Settle_Back', [1.9, 1.05, 0.1], [settleX, 0.98, IN_Z - 0.05], timber);
  for (const dx of [-0.8, 0.8]) {
    box(`Settle_Leg${dx}`, [0.09, 0.42, 0.4], [settleX + dx, 0.21, IN_Z - 0.32], timber);
  }
  // On the back wall, between the scullery door and the stair. Against the
  // front wall it stood end-on to anybody coming through the door and filled a
  // third of that view with a blank slab.
  const dresserX = -3.3;
  box('Dresser_Body', [1.7, 1.95, 0.52], [dresserX, 0.975, IN_Z - 0.26], timber);
  for (const y of [0.95, 1.4, 1.82]) {
    box(`Dresser_Shelf${y}`, [1.56, 0.05, 0.46], [dresserX, y, IN_Z - 0.3], timber);
  }
  // The parlour, kept deliberately sparse: one table and a chair say the room
  // is used without putting a second furnished set in a prototype.
  const parlourX = 7.5;
  box('Parlour_Table', [1.1, 0.08, 0.8], [parlourX, 0.74, -1.3], timber);
  for (const dx of [-0.45, 0.45]) {
    for (const dz of [-0.3, 0.3]) {
      box(`Parlour_Leg${dx}${dz}`, [0.09, 0.7, 0.09], [parlourX + dx, 0.35, -1.3 + dz], timber);
    }
  }
  box('Parlour_ChairSeat', [0.46, 0.06, 0.44], [parlourX - 1.1, 0.45, -1.3], timber);
  box('Parlour_ChairBack', [0.07, 0.88, 0.44], [parlourX - 1.32, 0.89, -1.3], timber);
  for (const dx of [-0.17, 0.17]) {
    for (const dz of [-0.17, 0.17]) {
      box(`Parlour_ChairLeg${dx}${dz}`, [0.06, 0.42, 0.06], [parlourX - 1.1 + dx, 0.21, -1.3 + dz], timber);
    }
  }

  return shell.root === root ? root : root;
}

/**
 * A thick isosceles gable, standing on its base with its apex up: the porch's
 * tympanum. Built here rather than from a box because a triangle under two
 * slopes is the one shape the primitive set has no entry for.
 */
/**
 * The porch tympanum: a triangular prism, built by hand because Kiln's library
 * has no triangular solid.
 *
 * BOTH FACES ARE WOUND FROM ONE OUTLINE, and that is the whole trick. An
 * earlier version stored the back face already reversed, which made `back[i]`
 * the partner of `front[i ^ 1]` rather than of `front[i]`; the rim then stitched
 * the right-hand slope to the left-hand base corner and the prism came out
 * twisted, with its underside facing into the solid. Kiln's structural pass
 * caught it - "a valid closed solid could not be measured (Not manifold)" - on a
 * part small enough that no view sheet would ever have shown it.
 *
 * So: one outline, two faces from it, the back wound the other way, and a rim of
 * one quad per outline edge pairing corner i with corner i. Eight triangles,
 * closed, every normal pointing out.
 */
function triangleGable(half, rise, thickness) {
  const d = thickness / 2;
  const outline = [[-half, 0], [half, 0], [0, rise]];
  const front = outline.map(([x, y]) => [x, y, d]);
  const back = outline.map(([x, y]) => [x, y, -d]);
  const positions = [];
  const push = (p) => positions.push(p[0], p[1], p[2]);
  // The face toward +Z, counter-clockwise seen from in front of it.
  push(front[0]); push(front[1]); push(front[2]);
  // The same corners the other way round, so this one faces -Z.
  push(back[2]); push(back[1]); push(back[0]);
  // One quad per edge of the outline, each wound to face away from the solid.
  for (let i = 0; i < outline.length; i += 1) {
    const j = (i + 1) % outline.length;
    push(front[i]); push(back[i]); push(back[j]);
    push(front[i]); push(back[j]); push(front[j]);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}
