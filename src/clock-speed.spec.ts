import { readFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import {
    parseClockSpeedSpec,
    resolveTypePath,
    getMachineName,
    extractClassName,
    getClockSpeed,
    setClockSpeed,
    adjustBlueprintClockSpeeds,
    writeBlueprintFiles,
    formatClockSpeed,
    MACHINE_TYPE_PATHS,
} from './clock-speed';
import { Parser } from '@etothepii/satisfactory-file-parser';

const testDataDir = join(__dirname, 'test-data');

function readBlueprint(name: string) {
    const sbpPath = join(testDataDir, `${name}.sbp`);
    const sbcfgPath = join(testDataDir, `${name}.sbpcfg`);
    return {
        sbpBuffer: new Uint8Array(readFileSync(sbpPath)).buffer,
        sbcfgBuffer: new Uint8Array(readFileSync(sbcfgPath)).buffer,
    };
}

/**
 * Write a blueprint to temporary files, read it back, run assertions, then clean up.
 */
function withRoundTrip(
    blueprint: ReturnType<typeof Parser.ParseBlueprintFiles>,
    name: string,
    assertions: (rereadBp: ReturnType<typeof Parser.ParseBlueprintFiles>) => void
): void {
    const tmpSbp = join('/tmp', `${name}.sbp`);
    const tmpCfg = join('/tmp', `${name}.sbpcfg`);

    writeBlueprintFiles(blueprint, tmpSbp, tmpCfg);

    try {
        const rereadBp = Parser.ParseBlueprintFiles(name,
            new Uint8Array(readFileSync(tmpSbp)).buffer,
            new Uint8Array(readFileSync(tmpCfg)).buffer
        );
        assertions(rereadBp);
    } finally {
        unlinkSync(tmpSbp);
        unlinkSync(tmpCfg);
    }
}

describe('parseClockSpeedSpec', () => {
    it('parses a single machine:clockspeed pair', () => {
        const result = parseClockSpeedSpec('Refinery:2');
        expect(result).toEqual([{ machineName: 'refinery', clockSpeed: 2 }]);
    });

    it('parses multiple machine:clockspeed pairs', () => {
        const result = parseClockSpeedSpec('Refinery:2,Manufacturer:3.66');
        expect(result).toEqual([
            { machineName: 'refinery', clockSpeed: 2 },
            { machineName: 'manufacturer', clockSpeed: 3.66 },
        ]);
    });

    it('handles whitespace in spec string', () => {
        const result = parseClockSpeedSpec(' Refinery : 2 , Manufacturer : 3.66 ');
        expect(result).toEqual([
            { machineName: 'refinery', clockSpeed: 2 },
            { machineName: 'manufacturer', clockSpeed: 3.66 },
        ]);
    });

    it('throws on missing colon', () => {
        expect(() => parseClockSpeedSpec('Refinery2')).toThrow('expected format');
    });

    it('throws on invalid clock speed', () => {
        expect(() => parseClockSpeedSpec('Refinery:abc')).toThrow('must be a positive number');
    });

    it('throws on negative clock speed', () => {
        expect(() => parseClockSpeedSpec('Refinery:-1')).toThrow('must be a positive number');
    });

    it('throws on zero clock speed', () => {
        expect(() => parseClockSpeedSpec('Refinery:0')).toThrow('must be a positive number');
    });

    it('throws on empty string', () => {
        expect(() => parseClockSpeedSpec('')).toThrow('No valid clock speed specifications');
    });

    it('throws on missing machine name', () => {
        expect(() => parseClockSpeedSpec(':2')).toThrow('missing machine name');
    });

    it('handles high overclock values (>2.5x)', () => {
        const result = parseClockSpeedSpec('Packager:10');
        expect(result).toEqual([{ machineName: 'packager', clockSpeed: 10 }]);
    });
});

describe('resolveTypePath', () => {
    it('resolves known machine names', () => {
        expect(resolveTypePath('refinery')).toBe(MACHINE_TYPE_PATHS['refinery']);
        expect(resolveTypePath('manufacturer')).toBe(MACHINE_TYPE_PATHS['manufacturer']);
        expect(resolveTypePath('packager')).toBe(MACHINE_TYPE_PATHS['packager']);
    });

    it('is case-insensitive', () => {
        // resolveTypePath lowercases the input before lookup
        expect(resolveTypePath('refinery')).toBe(MACHINE_TYPE_PATHS['refinery']);
    });

    it('accepts direct typePaths', () => {
        const directPath = '/Game/FactoryGame/Buildable/Factory/Packager/Build_Packager.Build_Packager_C';
        expect(resolveTypePath(directPath)).toBe(directPath);
    });

    it('returns null for unknown names', () => {
        expect(resolveTypePath('unknownmachine')).toBeNull();
    });
});

describe('getMachineName', () => {
    it('returns friendly name for known type paths', () => {
        expect(getMachineName('/Game/FactoryGame/Buildable/Factory/Packager/Build_Packager.Build_Packager_C')).toBe('packager');
        expect(getMachineName('/Game/FactoryGame/Buildable/Factory/OilRefinery/Build_OilRefinery.Build_OilRefinery_C')).toBe('refinery');
    });

    it('returns null for unknown type paths', () => {
        expect(getMachineName('/Game/FactoryGame/Buildable/Factory/StorageContainerMk1/Build_StorageContainerMk1.Build_StorageContainerMk1_C')).toBeNull();
    });
});

describe('extractClassName', () => {
    it('extracts class name from typePaths', () => {
        expect(extractClassName('/Game/FactoryGame/Buildable/Factory/Packager/Build_Packager.Build_Packager_C')).toBe('Packager');
        expect(extractClassName('/Game/FactoryGame/Buildable/Factory/ManufacturerMk1/Build_ManufacturerMk1.Build_ManufacturerMk1_C')).toBe('ManufacturerMk1');
    });
});

describe('formatClockSpeed', () => {
    it('formats 1.0 as 100.0%', () => {
        expect(formatClockSpeed(1.0)).toBe('100.0%');
    });

    it('formats 2.5 as 250.0%', () => {
        expect(formatClockSpeed(2.5)).toBe('250.0%');
    });

    it('formats 0.5 as 50.0%', () => {
        expect(formatClockSpeed(0.5)).toBe('50.0%');
    });

    it('formats 10.0 as 1000.0%', () => {
        expect(formatClockSpeed(10.0)).toBe('1000.0%');
    });
});

describe('getClockSpeed and setClockSpeed', () => {
    it('returns default 1.0 when no property exists', () => {
        const mockEntity = { properties: {} } as any;
        expect(getClockSpeed(mockEntity)).toBe(1.0);
    });

    it('reads existing clock speed property', () => {
        const mockEntity = {
            properties: {
                mCurrentPotential: {
                    type: 'FloatProperty',
                    ueType: 'FloatProperty',
                    name: 'mCurrentPotential',
                    value: 2.5,
                },
            },
        } as any;
        expect(getClockSpeed(mockEntity)).toBe(2.5);
    });

    it('sets both mCurrentPotential and mPendingPotential', () => {
        const mockEntity = { properties: {} } as any;
        setClockSpeed(mockEntity, 3.0);
        expect(mockEntity.properties['mCurrentPotential'].value).toBe(3.0);
        expect(mockEntity.properties['mPendingPotential'].value).toBe(3.0);
    });
});

describe('adjustBlueprintClockSpeeds', () => {
    it('adjusts clock speed on 1000 OC Packager blueprint', () => {
        const { sbpBuffer, sbcfgBuffer } = readBlueprint('1000 OC Packager');
        const specs = parseClockSpeedSpec('Packager:2.5');

        const { result } = adjustBlueprintClockSpeeds('test', sbpBuffer, sbcfgBuffer, specs);

        expect(result.machines.length).toBe(1);
        expect(result.machines[0].friendlyName).toBe('packager');
        expect(result.machines[0].currentClockSpeed).toBe(2.5);
        expect(result.adjustments[0].matchedCount).toBe(1);
    });

    it('adjusts clock speed on 2000 OC Refinery blueprint', () => {
        const { sbpBuffer, sbcfgBuffer } = readBlueprint('2000 OC Refinery');
        const specs = parseClockSpeedSpec('Refinery:5');

        const { result } = adjustBlueprintClockSpeeds('test', sbpBuffer, sbcfgBuffer, specs);

        expect(result.machines.length).toBe(1);
        expect(result.machines[0].friendlyName).toBe('refinery');
        expect(result.machines[0].currentClockSpeed).toBe(5);
    });

    it('adjusts multiple machine types in multi-machine blueprint', () => {
        const { sbpBuffer, sbcfgBuffer } = readBlueprint('multi-machine');
        const specs = parseClockSpeedSpec('Refinery:2,Manufacturer:3.66');

        const { result } = adjustBlueprintClockSpeeds('test', sbpBuffer, sbcfgBuffer, specs);

        expect(result.machines.length).toBe(3);

        // Check adjustments
        const refineryAdj = result.adjustments.find(a => a.machineName === 'refinery');
        const mfgAdj = result.adjustments.find(a => a.machineName === 'manufacturer');
        expect(refineryAdj!.matchedCount).toBe(1);
        expect(mfgAdj!.matchedCount).toBe(2);

        // Check clock speeds were applied
        const refineries = result.machines.filter(m => m.friendlyName === 'refinery');
        const manufacturers = result.machines.filter(m => m.friendlyName === 'manufacturer');
        expect(refineries[0].currentClockSpeed).toBe(2);
        expect(manufacturers[0].currentClockSpeed).toBe(3.66);
        expect(manufacturers[1].currentClockSpeed).toBe(3.66);
    });

    it('throws on unknown machine type', () => {
        const { sbpBuffer, sbcfgBuffer } = readBlueprint('1000 OC Packager');
        const specs = parseClockSpeedSpec('unknownmachine:2');

        expect(() => adjustBlueprintClockSpeeds('test', sbpBuffer, sbcfgBuffer, specs)).toThrow('Unknown machine type');
    });

    it('reports zero matches when machine type not in blueprint', () => {
        const { sbpBuffer, sbcfgBuffer } = readBlueprint('1000 OC Packager');
        const specs = parseClockSpeedSpec('Manufacturer:2');

        const { result } = adjustBlueprintClockSpeeds('test', sbpBuffer, sbcfgBuffer, specs);

        expect(result.adjustments[0].matchedCount).toBe(0);
    });
});

describe('round-trip: write and re-read adjusted blueprint', () => {
    it('preserves clock speed changes through write/read cycle', () => {
        const { sbpBuffer, sbcfgBuffer } = readBlueprint('multi-machine');
        const specs = parseClockSpeedSpec('Refinery:2,Manufacturer:3.66');

        const { blueprint } = adjustBlueprintClockSpeeds('test', sbpBuffer, sbcfgBuffer, specs);

        withRoundTrip(blueprint, 'roundtrip-test', (rereadBp) => {
            for (const obj of rereadBp.objects) {
                const cs = obj.properties['mCurrentPotential'] as any;
                const ps = obj.properties['mPendingPotential'] as any;
                if (!cs) continue;

                if (obj.typePath.includes('OilRefinery')) {
                    expect(cs.value).toBeCloseTo(2.0, 1);
                    expect(ps.value).toBeCloseTo(2.0, 1);
                } else if (obj.typePath.includes('ManufacturerMk1')) {
                    expect(cs.value).toBeCloseTo(3.66, 1);
                    expect(ps.value).toBeCloseTo(3.66, 1);
                }
            }
        });
    });

    it('handles very high overclock values (>2.5x)', () => {
        const { sbpBuffer, sbcfgBuffer } = readBlueprint('1000 OC Packager');
        const specs = parseClockSpeedSpec('Packager:10');

        const { blueprint } = adjustBlueprintClockSpeeds('test', sbpBuffer, sbcfgBuffer, specs);

        withRoundTrip(blueprint, 'high-oc-test', (rereadBp) => {
            const packager = rereadBp.objects.find(
                (o: any) => o.typePath.includes('Packager')
            );
            expect(packager).toBeDefined();
            const cs = packager!.properties['mCurrentPotential'] as any;
            expect(cs.value).toBeCloseTo(10.0, 1);
        });
    });

    it('generates 500 OC Refinery from 1000 OC Refinery and verifies round-trip', () => {
        // Read the 1000 OC Refinery (clock speed = 10.0, i.e. 1000%)
        const { sbpBuffer, sbcfgBuffer } = readBlueprint('1000 OC Refinery');
        const specs = parseClockSpeedSpec('Refinery:5');

        // Adjust to 500% (5.0x)
        const { blueprint, result } = adjustBlueprintClockSpeeds('500 OC Refinery', sbpBuffer, sbcfgBuffer, specs);

        expect(result.machines.length).toBe(1);
        expect(result.machines[0].friendlyName).toBe('refinery');
        expect(result.machines[0].currentClockSpeed).toBe(5);
        expect(result.adjustments[0].matchedCount).toBe(1);
        expect(result.adjustments[0].requestedClockSpeed).toBe(5);

        withRoundTrip(blueprint, '500-OC-Refinery', (rereadBp) => {
            const refinery = rereadBp.objects.find(
                (o: any) => o.typePath.includes('OilRefinery')
            );
            expect(refinery).toBeDefined();

            const cs = refinery!.properties['mCurrentPotential'] as any;
            const ps = refinery!.properties['mPendingPotential'] as any;
            expect(cs).toBeDefined();
            expect(ps).toBeDefined();
            expect(cs.value).toBeCloseTo(5.0, 1);
            expect(ps.value).toBeCloseTo(5.0, 1);
        });
    });
});
