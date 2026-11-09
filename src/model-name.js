// The model's name the way Hermes's own model button shows it ("mock-small" -> "Mock Small",
// "claude-opus-4-8" -> "Opus 4.8"). Hermes keeps no display name anywhere: its button works the
// name out from the id with the text rules below, and those rules are not in the plugin SDK, so
// this file carries a copy. Do not edit the rules: matching Hermes's button is the point
// (docs/answers/hhtech-model-display-name.md).
//
// Adapted from Hermes Agent, MIT License, Copyright (c) 2025 Nous Research:
// apps/desktop/src/lib/model-status-label.ts (Hermes v0.23.0, commit 2bd378ed). Copied:
// modelBaseId, VARIANT_TAGS, titleCase, VENDOR_CASING, PARAMETER_COUNT, applyVendorCasing,
// prettifyBase, splitTrailingTags, modelDisplayParts, modelVariantTag, formatModelPillLabel.
// Changes: TypeScript types removed; nothing else.

/** Strip provider prefix and normalize for display. */
export function modelBaseId(model) {
  const trimmed = model.trim()
  const slash = trimmed.lastIndexOf('/')

  return slash >= 0 ? trimmed.slice(slash + 1) : trimmed
}

const VARIANT_TAGS = [
  [/-fast$/i, 'Fast'],
  [/-flash$/i, 'Flash'],
  [/-thinking$/i, 'Thinking'],
  [/-preview$/i, 'Preview'],
  [/-latest$/i, 'Latest']
]

const titleCase = text => text.replace(/\b\w/g, char => char.toUpperCase()).trim()

const VENDOR_CASING = [
  [/\bDeepseek\b/g, 'DeepSeek'],
  [/\bGlm\b/g, 'GLM'],
  [/\bMinimax\b/g, 'MiniMax'],
  [/\bOpenai\b/g, 'OpenAI'],
  [/\bErnie\b/g, 'ERNIE'],
  [/\bMimo\b/g, 'MiMo'],
  [/\bBge\b/g, 'BGE'],
  [/\bVl\b/g, 'VL'],
  [/\bIt\b/g, 'IT'],
  [/\bFp8\b/g, 'FP8'],
  [/\bAi\b/g, 'AI']
]

const PARAMETER_COUNT = /\b(a?)(\d+(?:\.\d+)?)b\b/gi

const applyVendorCasing = text => {
  let cased = text.replace(PARAMETER_COUNT, (_match, prefix, size) => `${prefix.toUpperCase()}${size}B`)

  for (const [pattern, replacement] of VENDOR_CASING) {
    cased = cased.replace(pattern, replacement)
  }

  return cased
}

function prettifyBase(base) {
  if (/^claude-/i.test(base)) {
    return applyVendorCasing(
      titleCase(
        base
          .replace(/^claude-/i, '')
          .replace(/(\d)-(?=\d)/g, '$1.')
          .replace(/-/g, ' ')
      )
    )
  }

  if (/^gpt-/i.test(base)) {
    return base.replace(/^gpt-/i, 'GPT-')
  }

  if (/^gemini-/i.test(base)) {
    return applyVendorCasing(titleCase(base.replace(/^gemini-/i, 'Gemini ').replace(/-/g, ' ')))
  }

  return applyVendorCasing(titleCase(base.replace(/-/g, ' ')))
}

function splitTrailingTags(base) {
  let variant = ''
  let quant = ''

  for (let progress = true; progress;) {
    progress = false

    if (!variant) {
      for (const [pattern, label] of VARIANT_TAGS) {
        if (pattern.test(base)) {
          variant = label
          base = base.replace(pattern, '')
          progress = true

          break
        }
      }
    }

    if (!quant) {
      const quantMatch = base.match(/-(?:UD-)?(Q\d(?:_[A-Z0-9]+)*|IQ\d(?:_[A-Z0-9]+)*|F16|BF16)$/i)

      if (quantMatch) {
        quant = quantMatch[1].split('_')[0].toUpperCase()
        base = base.slice(0, -quantMatch[0].length)
        base = base.replace(/-(?:Instruct|Chat)(?:-\d{4})?$/i, '')
        progress = true
      }
    }
  }

  return { base, variant, quant }
}

/** Split a model id into a clean display name plus an optional grayed variant tag. */
export function modelDisplayParts(model) {
  let { base, variant, quant } = splitTrailingTags(modelBaseId(model))

  const tags = [variant, quant].filter(Boolean)

  const contextWindow = base.match(/\[(\d+[mk])\]$/i)

  if (contextWindow) {
    tags.push(contextWindow[1].toUpperCase())
    base = base.slice(0, -contextWindow[0].length)
  }

  base = base.replace(/-\d{8}$/, '')

  return { name: prettifyBase(base) || model.trim() || 'No model', tag: tags.join(' ') }
}

export function modelVariantTag(model) {
  return splitTrailingTags(modelBaseId(model)).variant
}

/** Composer model-pill label: model name plus its variant tag, "name · variant". */
export function formatModelPillLabel(model, options) {
  const name = modelDisplayParts(model).name

  const tag = model.trim()
    ? options?.serviceTier === 'ultrafast'
      ? 'Ultrafast'
      : options?.fastMode
        ? 'Fast'
        : modelVariantTag(model)
    : ''

  return tag ? `${name} · ${tag}` : name
}
