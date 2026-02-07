#!/usr/bin/env node

import { existsSync, readFileSync } from 'fs';
import { basename } from 'path';
import {
    parseClockSpeedSpec,
    adjustBlueprintClockSpeeds,
    writeBlueprintFiles,
    formatClockSpeed,
    MACHINE_TYPE_PATHS,
} from './clock-speed';

function printUsage(): void {
    console.log(`
Usage: blueprint-clock-speed <blueprint-base-path> <clock-speed-specs> [output-base-path]

Arguments:
  blueprint-base-path   Path to the blueprint files (without extension).
                        Expects both <path>.sbp and <path>.sbpcfg to exist.
  clock-speed-specs     Comma-separated list of "MachineName:clockspeed" pairs.
                        Clock speed is a float multiplier (e.g., 2.0 for 200%).
  output-base-path      Optional output path (without extension). Defaults to
                        <blueprint-base-path>_modified.

Examples:
  blueprint-clock-speed ./MyBlueprint "Refinery:2,Manufacturer:3.66"
  blueprint-clock-speed ./MyBlueprint "Packager:10" ./OutputBlueprint

Supported machine names:
  ${Object.keys(MACHINE_TYPE_PATHS).join(', ')}
`);
}

function main(): void {
    const args = process.argv.slice(2);

    if (args.length < 2 || args.includes('--help') || args.includes('-h')) {
        printUsage();
        process.exit(args.includes('--help') || args.includes('-h') ? 0 : 1);
    }

    const blueprintBasePath = args[0];
    const clockSpeedSpecStr = args[1];
    const outputBasePath = args[2] || `${blueprintBasePath}_modified`;

    // Resolve file paths
    const sbpPath = blueprintBasePath.endsWith('.sbp') ? blueprintBasePath : `${blueprintBasePath}.sbp`;
    const sbcfgPath = blueprintBasePath.endsWith('.sbp')
        ? blueprintBasePath.replace(/\.sbp$/, '.sbpcfg')
        : `${blueprintBasePath}.sbpcfg`;

    const outputSbpPath = outputBasePath.endsWith('.sbp') ? outputBasePath : `${outputBasePath}.sbp`;
    const outputSbcfgPath = outputBasePath.endsWith('.sbp')
        ? outputBasePath.replace(/\.sbp$/, '.sbpcfg')
        : `${outputBasePath}.sbpcfg`;

    // Validate input files exist
    if (!existsSync(sbpPath)) {
        console.error(`Error: Blueprint file not found: ${sbpPath}`);
        process.exit(1);
    }
    if (!existsSync(sbcfgPath)) {
        console.error(`Error: Blueprint config file not found: ${sbcfgPath}`);
        process.exit(1);
    }

    // Parse clock speed specifications
    let specs;
    try {
        specs = parseClockSpeedSpec(clockSpeedSpecStr);
    } catch (err: any) {
        console.error(`Error parsing clock speed specifications: ${err.message}`);
        process.exit(1);
    }

    console.log('=== Blueprint Clock Speed Adjuster ===\n');
    console.log(`Input:  ${sbpPath}`);
    console.log(`Config: ${sbcfgPath}`);
    console.log(`Output: ${outputSbpPath}`);
    console.log('');

    // Read input files
    const sbpBuffer = new Uint8Array(readFileSync(sbpPath)).buffer;
    const sbcfgBuffer = new Uint8Array(readFileSync(sbcfgPath)).buffer;

    const blueprintName = basename(blueprintBasePath);

    // Adjust clock speeds
    let adjustedBlueprint;
    try {
        adjustedBlueprint = adjustBlueprintClockSpeeds(blueprintName, sbpBuffer, sbcfgBuffer, specs);
    } catch (err: any) {
        console.error(`Error adjusting clock speeds: ${err.message}`);
        process.exit(1);
    }

    const { blueprint, result } = adjustedBlueprint;

    // Diagnostic output: list machines found
    if (result.machines.length === 0) {
        console.log('No production machines found in blueprint.');
    } else {
        console.log(`Found valid blueprint with ${result.machines.length} machine(s):`);
        for (const machine of result.machines) {
            console.log(`  - ${machine.friendlyName} (${machine.instanceName}): clock speed ${formatClockSpeed(machine.currentClockSpeed)}`);
        }
    }

    console.log('');

    // Report adjustments
    let anyMatched = false;
    for (const adj of result.adjustments) {
        if (adj.matchedCount === 0) {
            console.log(`  Warning: No "${adj.machineName}" machines found in blueprint to adjust.`);
        } else {
            console.log(`  Successfully adjusted ${adj.matchedCount} "${adj.machineName}" machine(s) to ${formatClockSpeed(adj.requestedClockSpeed)}.`);
            anyMatched = true;
        }
    }

    if (!anyMatched) {
        console.log('\nNo machines were modified. Output files will not be written.');
        process.exit(1);
    }

    // Write output files
    try {
        writeBlueprintFiles(blueprint, outputSbpPath, outputSbcfgPath);
    } catch (err: any) {
        console.error(`Error writing output files: ${err.message}`);
        process.exit(1);
    }

    console.log(`\nSuccessfully wrote modified blueprint to:`);
    console.log(`  ${outputSbpPath}`);
    console.log(`  ${outputSbcfgPath}`);
}

main();
