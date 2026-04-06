# LH-106 — Enable Anthropic prompt caching for system prompts

| Field    | Value                      |
|----------|----------------------------|
| Type     | Task                       |
| Priority | Medium                     |
| Points   | 2                          |
| Labels   | cost-optimization, ai      |

## Description

The system prompt (destination context, output schema instructions, persona) is sent on every API call and represents a significant portion of input tokens. Enable Anthropic prompt caching so the system prompt is cached across requests and billed at the reduced cached-token rate. This is a configuration change with outsized cost impact.

## Acceptance Criteria

- [ ] System prompt marked with `cache_control` breakpoint in API calls
- [ ] Cache hit rate visible in logs or Anthropic dashboard
- [ ] Input token cost reduced on repeated calls with same system prompt
- [ ] No regression in output quality from caching

## Notes

Prompt caching works best when the system prompt is stable. Avoid injecting per-request dynamic content into the cached portion — put variable context in the user message instead.

## Dependencies

- Independent — can be done after LH-101/102/103
