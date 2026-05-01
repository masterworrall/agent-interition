import type { ValidationResult, ValidationError, WriteEntryInput, MemoryEntry } from './types.js';
import {
  Identity,
  Preference,
  Procedure,
  Reference,
  Episode,
  RESERVED_AUTHORITATIVE_NAMESPACES,
  STANDARD_VERSION,
} from './vocab.js';

/**
 * Validate a write input against the Solid Memory Standard §9 rules.
 * This is the local pre-flight check the adapter runs before PUT.
 * CSS-side SHACL is the authoritative check (deferred to A148).
 */
export function validateWrite(input: WriteEntryInput): ValidationResult {
  const errors: ValidationError[] = [];

  // Required fields all types must have
  if (!input.label || input.label.trim() === '') {
    errors.push({ code: 'missing_required', message: 'label is required', field: 'label' });
  }
  if (!input.type) {
    errors.push({ code: 'missing_required', message: 'type is required', field: 'type' });
  }

  // Type-specific rules
  switch (input.type) {
    case Preference:
    case Procedure:
      if (!input.body || input.body.trim() === '') {
        errors.push({
          code: 'missing_required',
          message: `${input.type} entries must have a markdown body`,
          field: 'body',
        });
      }
      if (input.authoritativeSource) {
        errors.push({
          code: 'forbidden_field',
          message: 'authoritativeSource is only valid on mem:Reference entries',
          field: 'authoritativeSource',
        });
      }
      if (input.occurred) {
        errors.push({
          code: 'forbidden_field',
          message: 'occurred is only valid on mem:Episode entries',
          field: 'occurred',
        });
      }
      break;

    case Reference:
      if (input.body !== undefined) {
        errors.push({
          code: 'forbidden_field',
          message: 'mem:Reference entries must not have a body — they are pointers, not prose',
          field: 'body',
        });
      }
      if (!input.authoritativeSource) {
        errors.push({
          code: 'missing_required',
          message: 'mem:Reference entries must have an authoritativeSource',
          field: 'authoritativeSource',
        });
      }
      if (input.occurred) {
        errors.push({
          code: 'forbidden_field',
          message: 'occurred is only valid on mem:Episode entries',
          field: 'occurred',
        });
      }
      break;

    case Episode:
      if (!input.occurred) {
        errors.push({
          code: 'missing_required',
          message: 'mem:Episode entries must have an occurred timestamp',
          field: 'occurred',
        });
      }
      if (input.authoritativeSource) {
        errors.push({
          code: 'forbidden_field',
          message: 'authoritativeSource is only valid on mem:Reference entries',
          field: 'authoritativeSource',
        });
      }
      break;

    case Identity:
      // Identity is permissive — typically no body, no extra fields. Adapter caller knows.
      if (input.authoritativeSource) {
        errors.push({
          code: 'forbidden_field',
          message: 'authoritativeSource is only valid on mem:Reference entries',
          field: 'authoritativeSource',
        });
      }
      break;
  }

  // Authoritative-source duplication: any mention of reserved namespaces in the input fields
  // (catches accidental encoding of work-graph or CMDB facts). Body markdown is excluded —
  // bodies are prose, not metadata.
  for (const ns of RESERVED_AUTHORITATIVE_NAMESPACES) {
    const fieldsToCheck: Array<[string, string | undefined]> = [
      ['label', input.label],
      ['retrieve', input.retrieve],
      ['authoritativeSource', input.authoritativeSource],
    ];
    for (const [name, value] of fieldsToCheck) {
      if (value && value.includes(ns)) {
        // authoritativeSource is the legitimate place for reserved-namespace URIs to appear
        // (a Reference to /team/work/ etc.). Allow it there.
        if (name === 'authoritativeSource') continue;
        errors.push({
          code: 'authoritative_source_duplication',
          message: `${name} contains a reserved authoritative namespace (${ns}) — encode as mem:Reference instead`,
          field: name,
        });
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate a parsed entry's invariants on read. Used by store.loadEntry to
 * surface drift, missing fields, or version skew.
 */
export function validateEntry(entry: MemoryEntry): ValidationResult {
  const errors: ValidationError[] = [];

  if (!entry.author) {
    errors.push({ code: 'missing_required', message: 'mem:author is required', field: 'author' });
  }
  if (!entry.created) {
    errors.push({ code: 'missing_required', message: 'mem:created is required', field: 'created' });
  }
  if (!entry.standardVersion) {
    errors.push({
      code: 'missing_required',
      message: 'mem:standardVersion is required',
      field: 'standardVersion',
    });
  } else if (entry.standardVersion !== STANDARD_VERSION) {
    const [entryMajor] = entry.standardVersion.split('.');
    const [currentMajor] = STANDARD_VERSION.split('.');
    if (entryMajor !== currentMajor) {
      errors.push({
        code: 'standard_version_skew',
        message: `entry version ${entry.standardVersion} is incompatible with library version ${STANDARD_VERSION}`,
        field: 'standardVersion',
      });
    }
  }

  if (entry.type === Reference && entry.bodyUri) {
    errors.push({
      code: 'forbidden_field',
      message: 'mem:Reference must not have a body',
      field: 'body',
    });
  }
  if (entry.type === Reference && !entry.authoritativeSource) {
    errors.push({
      code: 'missing_required',
      message: 'mem:Reference must have authoritativeSource',
      field: 'authoritativeSource',
    });
  }
  if (entry.type === Episode && !entry.occurred) {
    errors.push({
      code: 'missing_required',
      message: 'mem:Episode must have occurred',
      field: 'occurred',
    });
  }

  return { valid: errors.length === 0, errors };
}
