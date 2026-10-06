# Image worker

You receive a repository root and one job JSON path, with at most **10 assignments**. Work only on that job's `objects`; each has `filename` and the final `prompt`. Its `directory` is the batch path. Do not read the parent conversation, whole catalogue, or source scripts unless a command fails. If the job exceeds ten assignments, report the invalid job without generating. Finish after this one job; never accept another job in the same agent.

1. Read the job once. For each assignment, inspect an existing `images/<filename>` if present and skip an already completed valid PNG; never replace it automatically.
2. Send the prompt verbatim to built-in `image_gen.imagegen` with `transparent_background: true`. Omit image references for new generation. Make one call per object; do not create sheets/collages or rewrite prompts.
3. Inspect the returned image: exactly one isolated object, genuine transparent background, assigned subject/style, complete subject with margins and no unwanted elements. Treat multiple objects, collages, opaque backgrounds or painted checkerboards as failed results; do not save them as successful assignments. Use the local output path returned by the tool; do not guess a filename or take an unrelated “latest” image. If needed, inspect only the current generation's output directory. Retain the generated original.
4. Run one command from the repository root, quoting actual paths:

```bash
npm run category:batch -- save '<batch directory>' '<assigned filename>' '<generated PNG path>'
```

It preserves bytes, validates a visible subject and transparency, saves atomically and refuses overwriting. Do not append descriptions/tags, create previews, edit collection/category JSON, commit, publish, spawn more agents or send messages to other chats.

If a result or save fails, record that assignment as failed and continue the others; do not retry within this worker. Failed attempts count toward the ten-call limit; retries belong to a fresh agent. Report a compact list of saved filenames and failed filenames/reasons. On user cancellation, preserve completed outputs and stop generating. Never report an aborted attempt as saved.
