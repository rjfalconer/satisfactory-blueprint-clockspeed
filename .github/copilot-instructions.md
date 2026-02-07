# Copilot Context

## Project Overview

This is a **CLI tool** that adjusts clock speeds on production machines in Satisfactory blueprint files (`.sbp` + `.sbpcfg`). It is **not** the `@etothepii/satisfactory-file-parser` library itself — it consumes that library as an npm dependency.

## Architecture

- **`src/clock-speed.ts`** — Core library: parsing clock speed specs, reading/writing blueprint files, adjusting machine clock speeds. All logic is exported as pure functions.
- **`src/index.ts`** — CLI entry point. Parses command-line arguments, calls into `clock-speed.ts`, handles file I/O and user output.
- **`src/clock-speed.spec.ts`** — Jest test suite covering unit tests and round-trip integration tests.
- **`src/test-data/`** — Binary `.sbp` and `.sbpcfg` blueprint fixtures used by tests. These are generated from real Satisfactory blueprints with specific machine types and clock speeds.

## Key Concepts

- **Clock speed** is stored as a float multiplier (`1.0` = 100%, `2.5` = 250%, `10.0` = 1000%). The properties `mCurrentPotential` and `mPendingPotential` (both `FloatProperty`) on a machine entity control its clock speed.
- **Machine entities** are identified by their `typePath` string (e.g., `/Game/FactoryGame/Buildable/Factory/OilRefinery/Build_OilRefinery.Build_OilRefinery_C` for a Refinery). The `MACHINE_TYPE_PATHS` map provides friendly name → typePath mappings.
- **Blueprint files** come in pairs: `.sbp` (compressed binary data) and `.sbpcfg` (configuration). Both are needed to parse/write a blueprint.
- Clock speeds above the vanilla 250% cap (2.5x multiplier) are supported for modded games.

## Tech Stack

- **TypeScript** (strict mode, ES2020 target, CommonJS modules)
- **Jest** with `ts-jest` for testing
- **`@etothepii/satisfactory-file-parser`** v3.3.0 for parsing/serialising Satisfactory blueprint binary formats

## Testing

- Run `npm test` to execute all tests
- Tests use binary fixture files in `src/test-data/`
- Round-trip tests write to `/tmp/` and clean up after themselves
- Test data includes: `1000 OC Packager`, `1000 OC Refinery`, `2000 OC Refinery`, and `multi-machine` blueprints

## Conventions

- Use British English in documentation and user-facing strings
- All machine names are normalised to lowercase internally
- The `parseClockSpeedSpec` function accepts `"MachineName:multiplier"` pairs separated by commas
