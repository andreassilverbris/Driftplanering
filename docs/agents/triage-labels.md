# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those roles to the actual label strings used in this repo's issue tracker.

| Label in mattpocock/skills | Label in our tracker | Meaning                                  |
| -------------------------- | -------------------- | ---------------------------------------- |
| `needs-triage`             | `needs-triage`       | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs-info`         | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`    | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `ready-for-human`    | Requires human implementation            |
| `wontfix`                  | `wontfix`            | Will not be actioned                     |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the corresponding label string from this table.

Edit the "Label in our tracker" column to match whatever vocabulary you actually use.

**Creating the labels:** all five labels exist in `andreassilverbris/Driftplanering` (created 2026-11-21).
If one is ever missing: on the user's Mac, `gh label create <name>`; in the cloud, GitHub creates a missing label
automatically the first time it is applied, otherwise ask the user to create it (Issues → Labels → New label).

## Track labels (Ralph loop)

Besides the five roles, every `ready-for-agent` issue the Ralph loop (`ralph/`, decision 50 in
`docs/koncept-och-beslut.md`) should run carries exactly one **track label**, named after the series it belongs to,
for example `etapp-5`. A pass runs one track: `./ralph/afk.sh <n> <track>`. Within a track, native blocking edges
decide the order. `to-tickets` sets the edges but not the track, so add the track label when publishing the tickets
(`gh label create <track>` first if it does not exist). `triage-sweep` gives every survivor one track label and
reuses existing tracks. See `ralph/DESIGN.md`.
