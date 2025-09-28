# Setting Up OpenAI API Key for Sensei

## Quick Setup

1. **Get your OpenAI API key**
   - Go to https://platform.openai.com/api-keys
   - Sign in or create an account
   - Click "Create new secret key"
   - Copy the key (it starts with `sk-`)

2. **Add the key to your environment**
   - Open the file `.env.local` in the project root
   - Find the line: `VITE_OPENAI_API_KEY=`
   - Add your key after the equals sign:
     ```
     VITE_OPENAI_API_KEY=sk-your-actual-key-here
     ```

3. **Restart the development server**
   - Stop the current server (Ctrl+C)
   - Run `npm run tauri dev` again

## Troubleshooting

### Key not loading?
- Make sure the file is named `.env.local` (not `.env`)
- Ensure there are no spaces around the `=` sign
- The key should not have quotes around it
- Restart the dev server after adding the key

### Still seeing 401 errors?
- Check that your API key is valid at https://platform.openai.com/api-keys
- Ensure you have API credits available
- The key might be rate-limited if used too much

## Features that use the API key

- **Automated Responses**: AI monitors your terminal and responds automatically
- **AI Assistant in Sensei**: Ask questions and get code suggestions

## Security Note

- The `.env.local` file is gitignored and won't be committed
- Never share your API key publicly
- Rotate your key if you suspect it's been compromised