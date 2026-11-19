# Patchroom

A virtual soundcheck for a hybrid event. Both voices belong in the room; only the room mic belongs on the guest’s call return. Try one mixer change, listen from either end, and check exactly which routes survive.

## Run the demo

Download the repository as a ZIP, extract it, and open **index.html** in a current desktop Chrome browser. The checked-in page includes Relate, the audio cues and the pixel art. It works offline and requires no account, API key, microphone permission or backend. For a local HTTP preview, run `python3 -m http.server 8000 --bind 127.0.0.1` in the project folder and visit `http://127.0.0.1:8000/`.

## A 45-second soundcheck

1. On **Hybrid meeting soundcheck**, keep **Call return** selected and press **Listen**. The room mic speaks first. The remote guest then hears their own line sent back into the call.
2. Choose **B · Preview fix**. The proposed edit turns off **Mixer CH 2 → AUX 1**. During the guest’s turn, the call return goes quiet.
3. Switch to **House PA**. Both voices still reach the room through MAIN. Switch between A and B without restarting the dialogue. **Trace the ports** reveals the offending route by name.
4. Try **Physical cables**. Removing a cable alone cannot meet this example’s output goals. Return to **Mixer sends** to apply the change to the simulated patch, then undo it.
5. Try **Live show · return loop** or import [the loop CSV](examples/venue-loop.csv). Preview the FX SEND → FX RETURN cable cut and listen for the repeat to disappear.

English is the initial interface language. The Japanese option is labelled 日本語. Switching preserves the active scene, edits, A/B selection, playback and monitor output. The two meeting soundcheck lines use English in both interfaces. Imported device names are kept as entered.

## Import a patch

The [meeting](examples/venue-hybrid.csv), [loop](examples/venue-loop.csv) and [basic mixer](examples/venue-patch.csv) CSVs can be loaded from disk. Use `source_device,source_port,destination_device,destination_port` as the four required columns. Optional columns are `source_role,destination_role,connection_type`. For a mixer’s internal input-to-output path, use the same mixer in both device columns and `send` for connection_type. Omitted internal sends can be edited in the matrix. `cable` describes a physical output-to-input connection. CSV data stays inside the browser.

## What Relate contributes

The app embeds **@relate/relate-wasm 1.1.0**. A mixer has separate input and output jacks. Cables and enabled sends become directed SIGNAL edges between jack nodes. For example, connecting the desk’s two channels to MAIN does not imply that both should also reach AUX 1.

The CSV workflow builds the graph in Relate and queries its edges. Starting with the jacks of one source group, the app repeatedly queries Relate for the next frontier and stops when it finds no new jacks.

```cypher
MATCH (a:Jack)-[:SIGNAL]->(b:Jack)
WHERE a.id IN $ids
RETURN DISTINCT b.id AS id
```

The JavaScript solver uses that adjacency and baseline reachability. It looks for a path carrying an excluded source or a directed cycle, tries permitted changes in increasing edit-count order, and rejects edits that interrupt a required source. If it reaches a time or search limit, it reports an inconclusive result. The free patchbay also runs Cypher variable-length path and cycle queries. The running app uses no LLM.

## Rebuild and verify

Use Node.js 20 or newer, npm and Python 3.10 or newer. The initial dependency install needs network access.

```sh
npm ci --ignore-scripts
npm test
npm run build
```

The build regenerates `index.html` from `src/`, `assets/` and the pinned npm package. The test compares the solver to exhaustive enumeration on 600 small seeded graphs. The interactive demo above also exercises the real WASM and browser audio.

## Scope and credits

Patchroom simulates a patch with two source groups. When multiple devices share a group, reachability means at least one reaches the output. It does not connect to a mixer, measure feedback or model acoustic pickup, unknown DSP routes or conferencing software. Trial edits affect only the simulated patch. Imported patches and editing history are held in memory; a reload reopens the example.

See [production and third-party credits](NOTICE.md) and [the Relate license](licenses/Relate-Apache-2.0.txt). Patchroom is an independent entry to the [Relate by Neo4j Hackathon](https://relate.devpost.com/).
