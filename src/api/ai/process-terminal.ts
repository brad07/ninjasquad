import { OpenAI } from 'openai';

// Get API key from environment
const apiKey = import.meta.env.VITE_OPENAI_API_KEY || '';

if (!apiKey) {
  console.warn('OpenAI API key not found. Set VITE_OPENAI_API_KEY in .env.local file');
}

const openai = new OpenAI({
  apiKey: apiKey,
  dangerouslyAllowBrowser: true // Since this is in Tauri context
});

export async function processTerminalOutput(
  context: string,
  projectPath: string,
  projectName: string,
  customSystemPrompt?: string,
  model: string = 'gpt-4o-mini' // Model parameter for AI selection
): Promise<string> {
  // Check if API key is configured
  if (!apiKey) {
    console.error('OpenAI API key not configured. Please add VITE_OPENAI_API_KEY to your .env.local file');
    return '';
  }

  try {
    const systemPrompt = customSystemPrompt || `You are an AI assistant helping with a development project called "${projectName}" at path "${projectPath}".
You are monitoring terminal output and should provide helpful responses when needed.

Rules:
1. Only respond with executable commands or very brief answers
2. If the terminal is asking a yes/no question, respond with just "y" or "n"
3. If the terminal needs a selection, respond with just the number or letter
4. If it's showing an error, suggest a fix command
5. If it's waiting for input but context is unclear, respond with "?" to get more info
6. Never use backticks or markdown formatting - just plain text
7. Keep responses under 100 characters when possible

Context shows new terminal output since monitoring started.`;

    // Use max_completion_tokens for GPT-5, max_tokens for other models
    const completionParams: any = {
      model: model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Terminal output:\n${context}\n\nWhat should I type next? (or empty if no action needed)` }
      ],
    };

    // GPT-5 has different parameter requirements
    if (model === 'gpt-5') {
      completionParams.max_completion_tokens = 20000; // Proper limit for code generation
      // GPT-5 only supports default temperature (1.0)
    } else {
      completionParams.max_tokens = 4096; // Higher limit for other models too
      completionParams.temperature = 0.3;
    }

    console.log('OpenAI API params:', completionParams);
    console.log('[SENDING TO SENSEI] Context preview:', context.substring(0, 200));
    console.log('[SENDING TO SENSEI] Context length:', context.length, 'chars');

    const completion = await openai.chat.completions.create(completionParams);
    console.log('OpenAI API response:', completion);
    console.log('[SENSEI RESPONSE] Choices:', completion.choices);

    const response = completion.choices[0]?.message?.content || '';
    console.log('Extracted response:', response);
    console.log('[SENSEI RESPONSE] Length:', response.length);

    // Clean up response - remove any markdown or backticks
    const cleaned = response
      .replace(/```[^`]*```/g, '')
      .replace(/`/g, '')
      .trim();
    console.log('Cleaned response:', cleaned);

    return cleaned;
  } catch (error) {
    console.error('Error processing terminal output:', error);
    return '';
  }
}

// Export for API route handler if using Next.js style API routes
export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { context, projectPath, projectName, customSystemPrompt, model } = req.body;

  if (!context) {
    return res.status(400).json({ error: 'Context is required' });
  }

  try {
    const response = await processTerminalOutput(context, projectPath, projectName, customSystemPrompt, model);
    return res.status(200).json({ response });
  } catch (error) {
    console.error('API error:', error);
    return res.status(500).json({ error: 'Failed to process terminal output' });
  }
}