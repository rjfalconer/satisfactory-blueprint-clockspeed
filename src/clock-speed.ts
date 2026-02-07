import { Parser, SaveEntity, SaveComponent, FloatProperty } from '@etothepii/satisfactory-file-parser';
import { writeFileSync } from 'fs';

/**
 * Map of friendly machine names to their Satisfactory typePath patterns.
 * The key is case-insensitive and matched against the entity typePath.
 */
export const MACHINE_TYPE_PATHS: Record<string, string> = {
    'constructor': '/Game/FactoryGame/Buildable/Factory/ConstructorMk1/Build_ConstructorMk1.Build_ConstructorMk1_C',
    'assembler': '/Game/FactoryGame/Buildable/Factory/AssemblerMk1/Build_AssemblerMk1.Build_AssemblerMk1_C',
    'manufacturer': '/Game/FactoryGame/Buildable/Factory/ManufacturerMk1/Build_ManufacturerMk1.Build_ManufacturerMk1_C',
    'refinery': '/Game/FactoryGame/Buildable/Factory/OilRefinery/Build_OilRefinery.Build_OilRefinery_C',
    'packager': '/Game/FactoryGame/Buildable/Factory/Packager/Build_Packager.Build_Packager_C',
    'smelter': '/Game/FactoryGame/Buildable/Factory/SmelterMk1/Build_SmelterMk1.Build_SmelterMk1_C',
    'foundry': '/Game/FactoryGame/Buildable/Factory/FoundryMk1/Build_FoundryMk1.Build_FoundryMk1_C',
    'blender': '/Game/FactoryGame/Buildable/Factory/Blender/Build_Blender.Build_Blender_C',
    'particleaccelerator': '/Game/FactoryGame/Buildable/Factory/HadronCollider/Build_HadronCollider.Build_HadronCollider_C',
    'quantumencoder': '/Game/FactoryGame/Buildable/Factory/QuantumEncoder/Build_QuantumEncoder.Build_QuantumEncoder_C',
    'converter': '/Game/FactoryGame/Buildable/Factory/Converter/Build_Converter.Build_Converter_C',
};

/** Extract a friendly machine name from a typePath, only for known production machines */
export function getMachineName(typePath: string): string | null {
    for (const [name, machineTypePath] of Object.entries(MACHINE_TYPE_PATHS)) {
        if (typePath === machineTypePath) {
            return name;
        }
    }
    return null;
}

/**
 * Extract a class name from any typePath for display purposes.
 * E.g., "/Game/.../Build_Packager.Build_Packager_C" → "Packager"
 */
export function extractClassName(typePath: string): string {
    const match = typePath.match(/Build_(\w+?)(Mk\d+)?\.\w+_C$/);
    if (match) {
        return match[1] + (match[2] || '');
    }
    // Fallback: use last segment
    const segments = typePath.split('.');
    return segments[segments.length - 1] || typePath;
}

/** Check if a SaveObject is a known production machine */
export function isProductionMachine(obj: SaveEntity | SaveComponent): boolean {
    return getMachineName(obj.typePath) !== null;
}

/** Read a float property value, returning a default if the property is absent */
function getFloatPropertyValue(entity: SaveEntity | SaveComponent, propertyName: string, defaultValue: number): number {
    const prop = entity.properties[propertyName] as FloatProperty | undefined;
    if (prop && prop.type === 'FloatProperty') {
        return prop.value;
    }
    return defaultValue;
}

/** Get the current clock speed from a machine entity (as a multiplier, e.g., 1.0 = 100%) */
export function getClockSpeed(entity: SaveEntity | SaveComponent): number {
    return getFloatPropertyValue(entity, 'mCurrentPotential', 1.0);
}

/** Get the pending clock speed from a machine entity */
export function getPendingClockSpeed(entity: SaveEntity | SaveComponent): number {
    return getFloatPropertyValue(entity, 'mPendingPotential', 1.0);
}

/**
 * Create a FloatProperty compatible with the parser library.
 */
function createFloatProperty(name: string, value: number): FloatProperty {
    return {
        type: 'FloatProperty',
        ueType: 'FloatProperty',
        name,
        value,
    } as FloatProperty;
}

/**
 * Set the clock speed on a machine entity.
 * @param entity The machine entity to modify
 * @param clockSpeed The clock speed as a multiplier (e.g. 2.0 for 200%)
 */
export function setClockSpeed(entity: SaveEntity | SaveComponent, clockSpeed: number): void {
    entity.properties['mCurrentPotential'] = createFloatProperty('mCurrentPotential', clockSpeed);
    entity.properties['mPendingPotential'] = createFloatProperty('mPendingPotential', clockSpeed);
}

export interface MachineInfo {
    instanceName: string;
    typePath: string;
    friendlyName: string;
    currentClockSpeed: number;
    objectIndex: number;
}

export interface ClockSpeedSpec {
    machineName: string;
    clockSpeed: number;
}

/**
 * Parse clock speed specification string.
 * Format: "MachineName:clockspeed,MachineName2:clockspeed2"
 * Clock speed is a float where 1.0 = 100%, 2.5 = 250%, etc.
 */
export function parseClockSpeedSpec(spec: string): ClockSpeedSpec[] {
    const results: ClockSpeedSpec[] = [];
    const pairs = spec.split(',');

    for (const pair of pairs) {
        const trimmed = pair.trim();
        if (!trimmed) continue;

        const colonIndex = trimmed.lastIndexOf(':');
        if (colonIndex === -1) {
            throw new Error(`Invalid clock speed spec "${trimmed}": expected format "MachineName:clockspeed"`);
        }

        const machineName = trimmed.substring(0, colonIndex).trim();
        const clockSpeedStr = trimmed.substring(colonIndex + 1).trim();
        const clockSpeed = parseFloat(clockSpeedStr);

        if (!machineName) {
            throw new Error(`Invalid clock speed spec "${trimmed}": missing machine name`);
        }

        if (isNaN(clockSpeed) || clockSpeed <= 0) {
            throw new Error(`Invalid clock speed "${clockSpeedStr}" for machine "${machineName}": must be a positive number`);
        }

        results.push({ machineName: machineName.toLowerCase(), clockSpeed });
    }

    if (results.length === 0) {
        throw new Error('No valid clock speed specifications provided');
    }

    return results;
}

/**
 * Resolve a machine name to its typePath. Supports both friendly names and direct typePaths.
 */
export function resolveTypePath(machineName: string): string | null {
    const lower = machineName.toLowerCase();
    if (MACHINE_TYPE_PATHS[lower]) {
        return MACHINE_TYPE_PATHS[lower];
    }
    // Check if it's already a typePath
    if (machineName.startsWith('/Game/') || machineName.startsWith('/Script/')) {
        return machineName;
    }
    return null;
}

export interface AdjustResult {
    machines: MachineInfo[];
    adjustments: Array<{
        machineName: string;
        matchedCount: number;
        requestedClockSpeed: number;
    }>;
}

/**
 * Main function: parse a blueprint, identify machines, and adjust clock speeds.
 */
export function adjustBlueprintClockSpeeds(
    blueprintName: string,
    sbpBuffer: ArrayBufferLike,
    sbcfgBuffer: ArrayBufferLike,
    specs: ClockSpeedSpec[]
): { blueprint: ReturnType<typeof Parser.ParseBlueprintFiles>; result: AdjustResult } {

    // Parse the blueprint
    const blueprint = Parser.ParseBlueprintFiles(blueprintName, sbpBuffer, sbcfgBuffer);

    // Identify all machine entities
    const machines: MachineInfo[] = [];
    for (let i = 0; i < blueprint.objects.length; i++) {
        const obj = blueprint.objects[i];
        const friendlyName = getMachineName(obj.typePath);
        if (friendlyName !== null) {
            machines.push({
                instanceName: obj.instanceName,
                typePath: obj.typePath,
                friendlyName,
                currentClockSpeed: getClockSpeed(obj),
                objectIndex: i,
            });
        }
    }

    // Apply clock speed adjustments
    const adjustments: AdjustResult['adjustments'] = [];

    for (const spec of specs) {
        const targetTypePath = resolveTypePath(spec.machineName);
        if (!targetTypePath) {
            throw new Error(
                `Unknown machine type "${spec.machineName}". ` +
                `Known types: ${Object.keys(MACHINE_TYPE_PATHS).join(', ')}`
            );
        }

        let matchedCount = 0;
        for (const machine of machines) {
            if (machine.typePath === targetTypePath) {
                const obj = blueprint.objects[machine.objectIndex];
                setClockSpeed(obj, spec.clockSpeed);
                machine.currentClockSpeed = spec.clockSpeed;
                matchedCount++;
            }
        }

        adjustments.push({
            machineName: spec.machineName,
            matchedCount,
            requestedClockSpeed: spec.clockSpeed,
        });
    }

    return { blueprint, result: { machines, adjustments } };
}

/**
 * Write a blueprint to .sbp and .sbcfg files.
 */
export function writeBlueprintFiles(
    blueprint: ReturnType<typeof Parser.ParseBlueprintFiles>,
    sbpOutputPath: string,
    sbcfgOutputPath: string
): void {
    let mainFileHeader: Uint8Array;
    const mainFileBodyChunks: Uint8Array[] = [];

    const response = Parser.WriteBlueprintFiles(
        blueprint,
        header => { mainFileHeader = header; },
        chunk => { mainFileBodyChunks.push(chunk); }
    );

    writeFileSync(sbpOutputPath, Buffer.concat([mainFileHeader!, ...mainFileBodyChunks]));
    writeFileSync(sbcfgOutputPath, Buffer.from(response.configFileBinary));
}

/**
 * Format a clock speed value for display (e.g., 2.0 → "200%")
 */
export function formatClockSpeed(value: number): string {
    return `${(value * 100).toFixed(1)}%`;
}
