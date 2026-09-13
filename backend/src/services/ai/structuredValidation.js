function validate(data, schema, path = 'value') {
  const errors = [];

  if (schema.enum) {
    if (!schema.enum.includes(data)) {
      errors.push(`${path}: expected one of [${schema.enum.join(', ')}], got ${JSON.stringify(data)}`);
    }
    return errors;
  }

  switch (schema.type) {
    case 'string':
      if (typeof data !== 'string') {
        errors.push(`${path}: expected string, got ${typeof data}`);
      } else if (schema.minLength && data.trim().length < schema.minLength) {
        errors.push(`${path}: too short (min ${schema.minLength} chars)`);
      }
      break;

    case 'number':
      if (typeof data !== 'number' || Number.isNaN(data)) {
        errors.push(`${path}: expected number, got ${typeof data}`);
      }
      break;

    case 'boolean':
      if (typeof data !== 'boolean') {
        errors.push(`${path}: expected boolean, got ${typeof data}`);
      }
      break;

    case 'array':
      if (!Array.isArray(data)) {
        errors.push(`${path}: expected array, got ${typeof data}`);
      } else {
        if (schema.minItems && data.length < schema.minItems) {
          errors.push(`${path}: expected at least ${schema.minItems} item(s), got ${data.length}`);
        }
        if (schema.items) {
          data.forEach((item, i) => errors.push(...validate(item, schema.items, `${path}[${i}]`)));
        }
      }
      break;

    case 'object':
      if (typeof data !== 'object' || data === null || Array.isArray(data)) {
        errors.push(`${path}: expected object, got ${typeof data}`);
      } else {
        for (const key of schema.required || []) {
          if (!(key in data)) errors.push(`${path}.${key}: required field missing`);
        }
        for (const [key, subSchema] of Object.entries(schema.properties || {})) {
          if (key in data) errors.push(...validate(data[key], subSchema, `${path}.${key}`));
        }
      }
      break;

    default:
      break;
  }

  return errors;
}

function validateStructured(data, schema) {
  const errors = validate(data, schema, 'root');
  return { valid: errors.length === 0, errors };
}

const QUIZ_QUESTION_SCHEMA = {
  type: 'object',
  required: ['prompt', 'type', 'correctAnswer', 'concept', 'difficulty'],
  properties: {
    prompt: { type: 'string', minLength: 3 },
    type: { enum: ['mcq', 'true_false', 'short_answer'] },
    options: { type: 'array', items: { type: 'string' } },
    correctAnswer: { type: 'string', minLength: 1 },
    concept: { type: 'string', minLength: 1 },
    difficulty: { enum: ['easy', 'medium', 'hard'] },
    explanation: { type: 'string' },
  },
};

const OPEN_ENDED_EVALUATION_SCHEMA = {
  type: 'object',
  required: ['isCorrect', 'feedback'],
  properties: {
    isCorrect: { type: 'boolean' },
    understanding: { type: 'string' },
    accuracy: { type: 'string' },
    relevance: { type: 'string' },
    keyConceptsCovered: { type: 'array', items: { type: 'string' } },
    missingConcepts: { type: 'array', items: { type: 'string' } },
    reasoningQuality: { type: 'string' },
    feedback: { type: 'string', minLength: 1 },
  },
};

const RECOMMENDATIONS_SCHEMA = {
  type: 'object',
  required: ['recommendations'],
  properties: {
    recommendations: { type: 'array', items: { type: 'string' } },
  },
};

const CLASSIFICATION_SCHEMA = {
  type: 'object',
  required: ['label'],
  properties: {
    label: { type: 'string', minLength: 1 },
    confidence: { type: 'number' },
    reasoning: { type: 'string' },
  },
};

module.exports = {
  validateStructured,
  QUIZ_QUESTION_SCHEMA,
  OPEN_ENDED_EVALUATION_SCHEMA,
  RECOMMENDATIONS_SCHEMA,
  CLASSIFICATION_SCHEMA,
};