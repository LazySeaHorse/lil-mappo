export interface ActionRecord {
  step: number;
  category: 'timeline' | 'canvas' | 'drafting' | 'inspector' | 'modal' | 'keyboard';
  name: string;
  details?: Record<string, unknown>;
  timestamp: number;
}

export class FlightRecorder {
  private buffer: ActionRecord[] = [];
  private readonly maxCapacity: number;
  private currentStep = 0;

  constructor(maxCapacity = 60) {
    this.maxCapacity = maxCapacity;
  }

  record(
    category: ActionRecord['category'],
    name: string,
    details?: Record<string, unknown>,
  ): ActionRecord {
    this.currentStep += 1;
    const entry: ActionRecord = {
      step: this.currentStep,
      category,
      name,
      details,
      timestamp: Date.now(),
    };

    this.buffer.push(entry);
    if (this.buffer.length > this.maxCapacity) {
      this.buffer.shift();
    }

    return entry;
  }

  getRecent(count = 30): ActionRecord[] {
    return this.buffer.slice(-count);
  }

  getTotalSteps(): number {
    return this.currentStep;
  }

  formatTrace(seed: number, reason?: string): string {
    const recent = this.getRecent(40);
    const lines: string[] = [];

    lines.push('================================================================');
    lines.push('🚨 [SMART MONKEY] FAILURE DETECTED — REPRODUCTION TRACE');
    lines.push('================================================================');
    if (reason) {
      lines.push(`Reason: ${reason}`);
    }
    lines.push(`Seed: ${seed}`);
    lines.push(`Total Steps Attempted: ${this.currentStep}`);
    lines.push('');
    lines.push('To reproduce this exact sequence, run:');
    lines.push(`  FUZZ_SEED=${seed} FUZZ_ACTIONS=${this.currentStep} npm run test:fuzz`);
    lines.push('');
    lines.push('Recent Action History (Last 40 steps):');
    lines.push('----------------------------------------------------------------');

    for (const record of recent) {
      const detailsStr = record.details && Object.keys(record.details).length > 0
        ? ` | ${JSON.stringify(record.details)}`
        : '';
      lines.push(
        `[#${record.step.toString().padStart(4, '0')}] [${record.category.toUpperCase().padEnd(9, ' ')}] ${record.name}${detailsStr}`,
      );
    }
    lines.push('================================================================');

    return lines.join('\n');
  }
}
