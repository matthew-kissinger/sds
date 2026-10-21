// SPDX-License-Identifier: AGPL-3.0-or-later
// Deployment composition. The public REST router never exposes these private services.
import identity from './index';
import RoomAdmission from './roomAdmission';
import InviteShell from './inviteShell';
export { RoomAdmission, InviteShell };
export default identity;
