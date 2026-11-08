import { test } from 'node:test';
import assert from 'node:assert/strict';

// Pure formula function matching ProductionPlanManager.tsx
function calculateMachineDailyCapacity(machine) {
    const yarn = Number(machine.yarnCount) || 0;
    const pos = Number(machine.positionsCount) || 0;
    const spd = Number(machine.speedMpm) || 0;
    const eff = Number(machine.efficiencyPct ?? 100) / 100;

    if (yarn <= 0 || pos <= 0 || spd <= 0) return 0;
    // Formula: (yarn * 60 * 24 * pos * spd) / 9,000,000
    const rawDaily = (yarn * 60 * 24 * pos * spd) / 9000000;
    return rawDaily * eff;
}

function calculateMachinePeriodCapacity(machine, days = 1) {
    const daily = calculateMachineDailyCapacity(machine);
    return daily * Math.max(1, days);
}

test('Production Plan Machine Capacity Formula: (yarnCount * 60 * 24 * positionsCount * speedMpm) / 9,000,000', () => {
    // Test case 1: DTY machine
    // Yarn: 150 Denier, Positions: 288, Speed: 800 mpm, Efficiency: 100%
    // 150 * 60 * 24 * 288 * 800 = 49,766,400,000
    // 49,766,400,000 / 9,000,000 = 5529.6 kg/day
    const machine1 = {
        id: 'test_1',
        code: 'DTY-01',
        name: 'دستگاه DTY شماره ۱',
        yarnCount: 150,
        positionsCount: 288,
        speedMpm: 800,
        efficiencyPct: 100,
        active: true
    };

    const daily1 = calculateMachineDailyCapacity(machine1);
    assert.equal(Math.round(daily1 * 10) / 10, 5529.6, 'Daily capacity should equal 5529.6 kg');

    // Period of 30 days (1 month)
    const month1 = calculateMachinePeriodCapacity(machine1, 30);
    assert.equal(Math.round(month1 * 10) / 10, 165888.0, '30-day capacity should equal 165888 kg');

    // Test case 2: 75 Denier, 240 positions, 750 mpm, Efficiency: 95%
    // 75 * 1440 * 240 * 750 = 19,440,000,000
    // 19,440,000,000 / 9,000,000 = 2160 kg * 0.95 = 2052 kg
    const machine2 = {
        id: 'test_2',
        code: 'DTY-02',
        name: 'دستگاه DTY شماره ۲',
        yarnCount: 75,
        positionsCount: 240,
        speedMpm: 750,
        efficiencyPct: 95,
        active: true
    };

    const daily2 = calculateMachineDailyCapacity(machine2);
    assert.equal(Math.round(daily2), 2052, 'Daily capacity with 95% efficiency should equal 2052 kg');

    // Test case 3: Zero or negative inputs produce 0
    const zeroMachine = {
        id: 'zero',
        code: 'Z-01',
        name: 'دستگاه خاموش',
        yarnCount: 0,
        positionsCount: 240,
        speedMpm: 750,
        efficiencyPct: 100,
        active: false
    };
    assert.equal(calculateMachineDailyCapacity(zeroMachine), 0);
});
