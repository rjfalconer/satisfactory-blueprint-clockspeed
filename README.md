# Blueprint Clock Speed Adjuster

A command-line tool for adjusting clock speeds on production machines in [Satisfactory](https://www.satisfactorygame.com/) blueprint files (`.sbp` + `.sbpcfg`).

## Credits

This tool is built on top of the excellent [`@etothepii/satisfactory-file-parser`](https://www.npmjs.com/package/@etothepii/satisfactory-file-parser) library by [etothepii](https://github.com/etothepii4/satisfactory-file-parser), which provides the blueprint parsing and serialisation capabilities.

## Installation

```bash
npm install
npm run build
```

## Usage

```
blueprint-clock-speed <blueprint-base-path> <clock-speed-specs> [output-base-path]
```

### Arguments

| Argument | Description |
|---|---|
| `blueprint-base-path` | Path to the blueprint files (without extension). Expects both `<path>.sbp` and `<path>.sbpcfg` to exist. |
| `clock-speed-specs` | Comma-separated list of `"MachineName:clockspeed"` pairs. Clock speed is a float multiplier (e.g., `2.0` for 200%). |
| `output-base-path` | *(Optional)* Output path (without extension). Defaults to `<blueprint-base-path>_modified`. |

### Supported Machine Names

`constructor`, `assembler`, `manufacturer`, `refinery`, `packager`, `smelter`, `foundry`, `blender`, `particleaccelerator`, `quantumencoder`, `converter`

## Examples

### Set a Refinery to 200% and a Manufacturer to 366%

```bash
node build/index.js ./MyBlueprint "Refinery:2,Manufacturer:3.66"
```

### Overclock a Packager to 1000%

Clock speeds above the vanilla 250% cap are supported:

```bash
node build/index.js ./MyBlueprint "Packager:10" ./OutputBlueprint
```

This sets the Packager to 1000% clock speed (10× multiplier).

### Set a Refinery to 500%

```bash
node build/index.js "./1000 OC Refinery" "Refinery:5" "./500 OC Refinery"
```

### Example output

```
=== Blueprint Clock Speed Adjuster ===

Input:  ./MyBlueprint.sbp
Config: ./MyBlueprint.sbpcfg
Output: ./MyBlueprint_modified.sbp

Found valid blueprint with 3 machine(s):
  - manufacturer (Build_ManufacturerMk1_C_001): clock speed 366.0%
  - refinery (Build_OilRefinery_C_002): clock speed 200.0%
  - manufacturer (Build_ManufacturerMk1_C_003): clock speed 366.0%

  Successfully adjusted 1 "refinery" machine(s) to 200.0%.
  Successfully adjusted 2 "manufacturer" machine(s) to 366.0%.

Successfully wrote modified blueprint to:
  ./MyBlueprint_modified.sbp
  ./MyBlueprint_modified.sbpcfg
```

## Testing

```bash
npm test
```

## How It Works

The tool uses the Satisfactory file parser to:

1. Read and decompress the binary `.sbp` blueprint file and its `.sbpcfg` configuration
2. Identify production machine entities by their `typePath`
3. Set the `mCurrentPotential` and `mPendingPotential` float properties to the requested clock speed multiplier
4. Serialise and compress the modified blueprint back to `.sbp` and `.sbpcfg` files
