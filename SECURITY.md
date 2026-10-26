# Security policy

## Supported version

Security fixes target the current public release of Sheepdog Sim.

## Reporting a vulnerability

Do not open a public issue for a vulnerability that could expose user data,
credentials, deployment access or a reproducible abuse path. Use GitHub's
private vulnerability reporting for the `matthew-kissinger/sds` repository, or
email [support@instruktlabs.com](mailto:support@instruktlabs.com) with the
subject "Security report: sds".

Include:

- the affected version or commit;
- reproduction steps;
- expected and actual behavior;
- browser, Worker or deployment surface involved;
- impact and any known workaround.

Version 3 does not require an account. It stores game preferences, personal
bests and a server-issued score identity in the browser. The optional solo-times
client can register or rename that identity, submit completion seconds and read
the public `field-v3` boards. Co-op (since 3.7.0) and shared-flock competitive
(since 3.8.0) multiplayer support two to four players through invite links and
regional public lobbies. They connect over WebSockets to a separate realtime
Worker at `/r/*`, which keeps multiplayer history in its own database.

Reports involving identity impersonation, leaked device secrets, score-service
authorization, name handling, leaderboard abuse, room or invite-link access,
lobby abuse or multiplayer state manipulation belong in private
vulnerability reporting. The score identity secret must never be logged,
included in URLs or committed to source.
