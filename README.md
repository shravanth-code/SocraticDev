>>>>>>>>>>>>>>>  SocraticDev Studio   <<<<<<<
​An AI-powered coding mentor IDE built to guide developers without giving away the answers.
​SocraticDev Studio is a professional, VS Code-themed coding environment that integrates a Socratic AI mentor (powered by Groq API) directly into your workflow. Instead of blindly writing code for you, it uses interactive hints, code skeletons, and step-by-step guidance to unblock your reasoning.
​>>>> Key Features
​Professional VS Code Aesthetic: Crafted using a clean dark-mode IDE layout featuring an activity bar, file explorer, tabs, and status bar.
​Powered by Monaco Editor: Real code editing experience complete with line numbers, syntax highlighting, and smooth multi-file navigation.
​Socratic AI Mentor Panel: Built-in AI assistant featuring specialized guidance modes:
​Concept Hint: Explains underlying architectural principles.
​Code Skeleton: Provides scaffolding without completing the logic.
​Unlock Solution: Helps bridge final roadblocks.
​VSIX Extension Support: Packaged as a native VS Code webview extension so developers can run it side-by-side inside actual Visual Studio Code.
​🛠️ Tech Stack
​Frontend: React, Vite, Tailwind CSS, Monaco Editor
​AI Engine: Groq API (llama-3.3-70b-versatile)
​Extension Framework: VS Code Extension API (@vscode/vsce)
​🚀 Getting Started Locally
​1. Clone the Repository
git clone https://github.com/your-username/socraticdev-studio.git
cd socraticdev-studio
Install Dependencies
npm install
3. Configure Environment Variables
​Create a .env file in the root directory and add your Groq API key:
>VITE_GROQ_API_KEY=your_groq_api_key_here
. Run the Development Server
>npm run dev
Open http://localhost:5173 in your browser.
>>>>>>>>>>>>>
> Packaging as a VS Code Extension (.vsix)
​To package and run SocraticDev natively inside VS Code:
Build the web app:
>cmd /c "npm run build"
Scaffold and copy to extension folder:
>node scaffold-vsix.js
xcopy /E /I dist\* vscode-extension\media\
Compile and package:
>cd vscode-extension
npm install
npx tsc -p ./
npx @vscode/vsce package
Install in VS Code:
​Open VS Code, press Ctrl + Shift + P, select Extensions: Install from VSIX..., and choose the generated .vsix file from the vscode-extension folder.
​Press Ctrl + Shift + S to launch the SocraticDev Studio panel!
