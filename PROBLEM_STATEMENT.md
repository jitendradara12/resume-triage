**Problem statement-**  
A company posted for 2 different job profiles\-  
1\. LifeCycle Assessment\(LCA\) role\- 4\-6 years experience\- [JD1](https://tally.so/r/9q5plp)  
2\. UI/UX Design internship role\- [JD2](https://tally.so/r/0QovpQ)  
[Here is a list of 47 anonymized resumes](https://workdrive.zohoexternal.in/folder/nyche10b5dccdb33743dfa46604e3aa2a2e2b) from people who applied. Some resumes belong to LCA profile, others belong to design profile.  
To help them hire effectively, you decide to build a prototype that can help them extract relevant information from the resumes, classify each resume against the two roles, and rank those resumes for each role based on their fit to its job description.  
Given the HR team's unfamiliarity with tech, you need to build and host a prototype on a free Vercel instance whose link you can submit in the form here.  
Your prototype should be able to support testing by uploading a new resume\- and ranking it within the resume pile\- based on your ranking logic\.

**Objectives**  
The prototype should:

1. Ingest the supplied resumes and job descriptions.
2. Extract relevant, job-related information from resume files.
3. Classify each resume as a stronger match for the LCA role, the UI/UX internship, both, or neither/uncertain.
4. Rank resumes separately for each role, with an understandable explanation of each ranking.
5. Present the results in a usable interface that supports human review.

**Functional requirements**  
Resume ingestion and extraction

- Extract useful information such as skills, relevant experience, education, projects, and role-specific keywords.
- Handle missing, inconsistent, or unreadable information gracefully.
- Preserve a link or reference to the source resume so a reviewer can inspect it.  
  Classification and ranking
- Compare each resume against JD1 and JD2.
- Provide a match score with a clearly defined ranking method for each role.
- Identify the main evidence behind each result\- for example, matching skills, relevant projects, or years of experience.  
  User interface
- Show the two job profiles and their respective ranked results.
- Let reviewers inspect a candidate’s extracted information and ranking logic.
- Include basic filtering or sorting, such as by score or relevant experience.
- Display extraction or classification errors in a way that helps the reviewer understand what happened.
- Your prototype should be able to support testing by uploading a new resume\- and ranking it within the resume pile\- based on your ranking logic\.

**Disclaimer** \- there's a real possibility that not every resume would be scraped correctly .  
**Important alert** \- if you submit your assignment without actually cleaning up the data output given by AI agents, or without sharing your methodology, the assignment will be auto\-rejected\. And yes, it's expected that you wouldn't do the assignment manually\.
