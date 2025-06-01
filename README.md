# Obsidian My Agent

This is an Obsidian plugin that is designed to support my own Obsidian life with the power of AI.

## Features

### Command: "Generate a weekly note"

This command executes the following steps:

1. Read 1 week of daily notes, send them to OpenAI's ChatGPT, and summarize them.
2. Read all updated notes in this week, send them to ChatGPT, and analyze them from specific perspectives.
3. Generate a new weekly note with the summary and analysis, then save it to the specified folder.

#### Analysis Perspectives for Updated Notes

The analysis of updated notes focuses on three key perspectives:

- **What this person is interested in**: Analyzes the underlying interests, motivations, and values based on the content of the notes, going beyond just listing topics to understand the deeper drivers of curiosity.

- **Thinking patterns**: Examines cognitive tendencies and approaches, including:
  - How they tend to perceive and approach problems
  - Logical vs. intuitive thinking preferences
  - Abstract vs. concrete thinking tendencies
  - Problem-solving approaches
  - Information organization and structuring patterns

- **Things this person might not realize about themselves**: Identifies unconscious patterns and characteristics that may not be apparent to the writer, such as:
  - Unconsciously held values and priorities
  - Hidden talents and strengths
  - Psychological factors behind behavior patterns
  - Growth opportunities and potential
  - Things they consider normal but are actually distinctive

#### Requirements

- Daily Notes plugin should be enabled and configured
- Periodic Notes plugin (optional, for folder configuration)

### Settings

- OpenAI API Key: API key for ChatGPT integration
