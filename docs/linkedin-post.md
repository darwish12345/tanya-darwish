# Draf pos LinkedIn

> Gantikan [X%] dengan skor eval sebenar dari /statistik, dan lampirkan video demo (video asli LinkedIn mendapat jangkauan
> lebih tinggi daripada pautan YouTube). Letak pautan dalam komen pertama jika mahu jangkauan lebih luas.

---

Instead of sending another PDF CV, I built an AI agent that recruiters can interview about my work. 🤖

It also runs my job search.

**On my portfolio site**, the agent:
→ answers questions with evidence from my projects and certificates (RAG), and says "I'm not sure" instead of making things up
→ scores how well I fit a job description you paste, including what I'm missing
→ books an interview straight into my calendar

**On Telegram, it's my personal agent:**
→ reminders exact to the minute, in Malaysia time, even from a voice note
→ a daily job search on Indeed and LinkedIn, with every role scored against my profile
→ a tailored ATS-friendly resume and cover letter for each role. Nothing is sent until I press "Send".

What I learned building it as an intern:
1️⃣ An agent is a loop, not a prompt. I wrote mine by hand (LLM → tool → result → LLM) so I understand every step.
2️⃣ Real users find real bugs. "Tomorrow skip LinkedIn" once became a permanent setting. Every bug like that is now a regression test.
3️⃣ Measure it. 56 automated eval cases run against the real model in GitHub Actions. Current score: [X%].
4️⃣ Keep humans in control of anything irreversible.

Stack: Next.js · TypeScript · Groq (gpt-oss-120b) · Upstash Redis & QStash · Telegram Bot API · Netlify. Running cost: RM0/month.

Try it: https://tanya-darwish.netlify.app
Code: https://github.com/darwish12345/tanya-darwish

I'm looking for junior software engineer / AI engineer roles in Malaysia. Happy to walk you through how it works.

#AgenticAI #SoftwareEngineering #NextJS #AIEngineering #Malaysia #OpenToWork
