type CronFieldName = 'minute' | 'hour' | 'dayOfMonth' | 'month' | 'dayOfWeek';

type CronFieldConfig = {
  field: CronFieldName;
  min: number;
  max: number;
};

const CRON_FIELD_CONFIGS: readonly CronFieldConfig[] = [
  { field: 'minute', min: 0, max: 59 },
  { field: 'hour', min: 0, max: 23 },
  { field: 'dayOfMonth', min: 1, max: 31 },
  { field: 'month', min: 1, max: 12 },
  { field: 'dayOfWeek', min: 0, max: 7 },
];

const DECIMAL_INTEGER_PATTERN = /^-?\d+$/;

function normalizeDayOfWeek(value: number): number {
  return value === 7 ? 0 : value;
}

function parseIntegerToken(args: { value: string; field: CronFieldName }): number {
  if (!DECIMAL_INTEGER_PATTERN.test(args.value)) {
    throw new TypeError(`cron:${args.field} must use integer values`);
  }

  const value = Number.parseInt(args.value, 10);
  if (!Number.isInteger(value)) {
    throw new TypeError(`cron:${args.field} must use integer values`);
  }

  return value;
}

function parseFieldToken(args: {
  token: string;
  config: CronFieldConfig;
  target: Set<number>;
}): void {
  const token = args.token.trim();
  const { config } = args;

  if (token.length === 0) {
    throw new TypeError(`cron:${config.field} token is empty`);
  }

  const stepParts = token.split('/');
  if (stepParts.length > 2) {
    throw new TypeError(`cron:${config.field} step is malformed`);
  }

  const [rangeToken, stepToken] = stepParts;
  if (rangeToken === undefined) {
    throw new TypeError(`cron:${config.field} token is malformed`);
  }

  const step =
    stepToken === undefined
      ? 1
      : parseIntegerToken({ value: stepToken, field: config.field });

  if (step <= 0) {
    throw new TypeError(`cron:${config.field} step must be positive`);
  }

  const addValue = (candidate: number): void => {
    const normalized = config.field === 'dayOfWeek' ? normalizeDayOfWeek(candidate) : candidate;
    if (normalized < config.min || normalized > config.max) {
      throw new TypeError(`cron:${config.field} value out of range`);
    }
    args.target.add(normalized);
  };

  if (rangeToken === '*') {
    for (let value = config.min; value <= config.max; value += step) {
      addValue(value);
    }
    return;
  }

  if (rangeToken.includes('-')) {
    const [startToken, endToken] = rangeToken.split('-', 2);
    if (!startToken || !endToken) {
      throw new TypeError(`cron:${config.field} range is malformed`);
    }

    const start = parseIntegerToken({ value: startToken, field: config.field });
    const end = parseIntegerToken({ value: endToken, field: config.field });
    if (start > end) {
      throw new TypeError(`cron:${config.field} range must be ascending`);
    }

    for (let value = start; value <= end; value += step) {
      addValue(value);
    }
    return;
  }

  if (stepToken !== undefined) {
    throw new TypeError(`cron:${config.field} step requires wildcard or ascending range`);
  }

  addValue(parseIntegerToken({ value: rangeToken, field: config.field }));
}

function parseField(args: { rawField: string; config: CronFieldConfig }): void {
  const tokens = args.rawField.split(',');
  const values = new Set<number>();

  for (const token of tokens) {
    parseFieldToken({ token, config: args.config, target: values });
  }

  if (values.size === 0) {
    throw new TypeError(`cron:${args.config.field} has no valid values`);
  }
}

function normalizeCronExpression(cronExpression: string): string {
  return cronExpression.trim().replace(/\s+/g, ' ');
}

export function validateCronExpression(args: { cronExpression: string }):
  | { ok: true; normalizedCronExpression: string }
  | { ok: false; reason: string } {
  const normalizedCronExpression = normalizeCronExpression(args.cronExpression);
  if (normalizedCronExpression.length === 0) {
    return { ok: false, reason: 'cron:expression is empty' };
  }

  const fields = normalizedCronExpression.split(' ');
  if (fields.length !== CRON_FIELD_CONFIGS.length) {
    return { ok: false, reason: `cron:expected ${CRON_FIELD_CONFIGS.length} fields` };
  }

  try {
    for (let index = 0; index < CRON_FIELD_CONFIGS.length; index += 1) {
      const config = CRON_FIELD_CONFIGS[index];
      const rawField = fields[index];
      if (!config || rawField === undefined) {
        return { ok: false, reason: 'cron:internal field parser mismatch' };
      }
      parseField({ rawField, config });
    }
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }

  return { ok: true, normalizedCronExpression };
}
