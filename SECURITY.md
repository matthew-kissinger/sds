# Security policy

## Supported version

Security fixes target the current public release of Sheepdog Sim.

## Reporting a vulnerability

Do not open a public issue for a vulnerability that could expose user data,
credentials, deployment access or a reproducible abuse path. Use GitHub's
private vulnerability reporting for the `matthew-kissinger/sds` repository.

Include:

- the affected version or commit;
- reproduction steps;
- expected and actual behavior;
- browser, Worker or deployment surface involved;
- impact and any known workaround.

Version 3.0 does not require an account. It stores game preferences, personal
bests and a server-issued score identity in the browser. The optional solo-times
client can register or rename that identity, submit completion seconds and read
the public `field-v3` boards. It contains no multiplayer, room or WebSocket path.

Reports involving identity impersonation, leaked device secrets, score-service
authorization, name handling or leaderboard abuse belong in private
vulnerability reporting. The score identity secret must never be logged,
included in URLs or committed to source.
