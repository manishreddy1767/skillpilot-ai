/**
 * SkillPilot's own knowledge: common skills, the names people use for them, what to learn first,
 * and what popular roles need. It is plain data, so role requirements, job matching, resumes, and
 * roadmaps work offline and reliably, even with a small local model or none at all.
 */

export type SkillCategory = 'technical' | 'tool' | 'soft' | 'domain'

export interface LibrarySkill {
  name: string
  /** Other names for it, as written in job descriptions and resumes. */
  aliases: string[]
  category: SkillCategory
  /** Skills worth learning first. */
  after: string[]
  /** What to study, by name rather than link, so it can be searched for. */
  learn: string
  /** A practical exercise that shows the skill. */
  practice: string
  /** Matched with exact capitals, for names that are also common words, such as Go. */
  exactCase?: boolean
}

export interface LibraryRole {
  id: string
  title: string
  aliases: string[]
  summary: string
  /** [skill, level needed 1 to 5 for an entry-level hire, importance 1 nice to have, 2 important, 3 essential] */
  needs: [string, number, 1 | 2 | 3][]
}

const s = (
  name: string,
  aliases: string[],
  category: SkillCategory,
  after: string[],
  learn: string,
  practice: string,
  exactCase = false
): LibrarySkill => ({ name, aliases, category, after, learn, practice, ...(exactCase ? { exactCase } : {}) })

export const LIBRARY_SKILLS: LibrarySkill[] = [
  // Foundations
  s('Git', ['github', 'gitlab', 'version control'], 'tool', [], 'Pro Git book; GitHub Skills courses', 'Keep a project on GitHub with branches, pull requests, and a clear history'),
  s('Linux', ['unix', 'ubuntu', 'linux command line'], 'tool', [], 'The Linux Command Line book; OverTheWire Bandit', 'Set up a Linux VM and automate a daily task with a script'),
  s('Bash', ['shell scripting', 'shell script', 'bash scripting'], 'technical', ['Linux'], 'Bash Guide for Beginners; ShellCheck', 'Write a script that backs up and rotates log files'),
  s('Data structures and algorithms', ['dsa', 'data structures', 'algorithms', 'problem solving in code'], 'technical', [], 'Grokking Algorithms; NeetCode 150 list; LeetCode', 'Solve 50 LeetCode problems across arrays, trees, graphs, and dynamic programming'),
  s('OOP', ['object oriented programming', 'object-oriented programming', 'oops'], 'technical', [], 'Head First Object-Oriented Analysis and Design', 'Model a library system with classes, interfaces, and inheritance'),
  s('Design patterns', ['solid principles'], 'technical', ['OOP'], 'Head First Design Patterns; Refactoring Guru', 'Refactor a project to use Strategy, Factory, and Observer where they fit'),
  s('System design', ['high level design', 'hld', 'low level design', 'lld', 'scalable systems'], 'technical', ['Data structures and algorithms', 'SQL'], 'System Design Primer; Designing Data-Intensive Applications', 'Design a URL shortener and write up the trade-offs'),
  s('SDLC', ['software development life cycle', 'software development lifecycle'], 'domain', [], 'Atlassian guides on the software lifecycle', 'Document a small project from requirements to release'),
  s('Agile', ['scrum', 'kanban', 'agile methodology'], 'domain', [], 'Scrum Guide; Atlassian Agile Coach', 'Run a personal project in two-week sprints with a backlog'),
  s('Jira', ['confluence'], 'tool', ['Agile'], 'Atlassian University free courses', 'Plan a project in Jira with epics, stories, and a board'),

  // Languages
  s('HTML', ['html5'], 'technical', [], 'MDN Learn Web Development: HTML', 'Build a semantic, accessible personal page'),
  s('CSS', ['css3', 'sass', 'scss', 'flexbox', 'css grid'], 'technical', ['HTML'], 'MDN Learn CSS; Kevin Powell on YouTube', 'Rebuild a landing page from a design using Flexbox and Grid'),
  s('JavaScript', ['js', 'ecmascript', 'es6', 'vanilla js'], 'technical', ['HTML'], 'javascript.info; Eloquent JavaScript', 'Build a quiz app with the DOM, events, and local storage'),
  s('TypeScript', ['ts'], 'technical', ['JavaScript'], 'TypeScript Handbook; Total TypeScript beginner course', 'Convert a JavaScript project to strict TypeScript'),
  s('Python', ['python3', 'py'], 'technical', [], 'Python Crash Course; Automate the Boring Stuff with Python', 'Automate a spreadsheet or file task with a Python script'),
  s('Java', ['core java', 'java 8', 'java 17', 'j2ee', 'java ee'], 'technical', ['OOP'], 'Head First Java; MOOC.fi Java Programming', 'Build a console bank-account app with collections and exceptions'),
  s('C', ['c programming', 'c language'], 'technical', [], 'K&R The C Programming Language; CS50', 'Write a linked list and a small file parser in C', true),
  s('C++', ['cpp', 'c plus plus', 'stl'], 'technical', ['OOP'], 'learncpp.com; Competitive programming with STL', 'Solve 30 DSA problems in C++ using the STL'),
  s('C#', ['c sharp', 'csharp'], 'technical', ['OOP'], 'Microsoft Learn C# path', 'Build a console inventory app in C#'),
  s('Go', ['golang'], 'technical', [], 'Tour of Go; Go by Example', 'Build a small REST API in Go with the standard library', true),
  s('Kotlin', [], 'technical', ['OOP'], 'Kotlin Koans; Android Basics with Compose', 'Write a Kotlin command-line tool, then an Android screen'),
  s('Swift', ['SwiftUI'], 'technical', ['OOP'], "Apple's Develop in Swift; Hacking with Swift 100 Days", 'Build a simple iPhone app with SwiftUI', true),
  s('PHP', ['laravel'], 'technical', ['HTML'], 'PHP The Right Way; Laracasts', 'Build a CRUD app with Laravel'),
  s('Ruby', ['ruby on rails', 'rails'], 'technical', [], 'The Odin Project Ruby path', 'Build a blog with Ruby on Rails'),
  s('Rust', [], 'technical', [], 'The Rust Book; Rustlings', 'Build a command-line tool in Rust', true),
  s('R', ['r programming', 'r language', 'rstudio'], 'technical', ['Statistics'], 'R for Data Science (Wickham)', 'Analyse a public dataset in R with ggplot2'),
  s('Dart', [], 'technical', ['OOP'], 'Dart language tour', 'Write Dart exercises before moving to Flutter', true),
  s('Scala', [], 'technical', ['Java'], 'Scala 3 Book', 'Process a dataset with Scala collections'),
  s('SQL', ['structured query language', 'sql queries', 'pl/sql', 't-sql', 'plsql'], 'technical', [], 'SQLBolt; Mode SQL Tutorial; LeetCode SQL 50', 'Answer 20 business questions from a sample database with joins and window functions'),

  // Web front end
  s('React', ['react.js', 'reactjs', 'react hooks'], 'technical', ['JavaScript'], 'react.dev Learn; Full Stack Open', 'Build a movie search app with React, hooks, and an API'),
  s('Next.js', ['nextjs', 'next js'], 'technical', ['React'], 'Next.js Learn course', 'Ship a blog with Next.js, routing, and server rendering'),
  s('Redux', ['redux toolkit', 'rtk'], 'technical', ['React'], 'Redux Essentials tutorial', 'Add Redux Toolkit state to a shopping cart'),
  s('Angular', ['angularjs', 'angular 2+'], 'technical', ['TypeScript'], 'Angular Tour of Heroes; angular.dev tutorials', 'Build a task manager with Angular and RxJS'),
  s('Vue', ['vue.js', 'vuejs', 'nuxt'], 'technical', ['JavaScript'], 'Vue.js official guide', 'Build a notes app with Vue and Pinia'),
  s('Tailwind CSS', ['tailwind', 'tailwindcss'], 'tool', ['CSS'], 'Tailwind CSS docs', 'Restyle a project with Tailwind utility classes'),
  s('Bootstrap', [], 'tool', ['CSS'], 'Bootstrap docs', 'Build a responsive admin page with Bootstrap'),
  s('Responsive design', ['mobile-first design', 'responsive web design'], 'technical', ['CSS'], 'MDN Responsive design; web.dev Learn Responsive', 'Make a site work well from phone to desktop'),
  s('Web accessibility', ['accessibility', 'a11y', 'wcag'], 'technical', ['HTML'], 'web.dev Learn Accessibility; WCAG 2.1 quick reference', 'Audit a site with axe and fix every issue found'),
  s('Jest', ['unit testing javascript', 'vitest', 'react testing library'], 'tool', ['JavaScript'], 'Jest docs; Testing Library docs', 'Add tests to a React project until the main paths are covered'),

  // Back end
  s('Node.js', ['node', 'nodejs', 'node js'], 'technical', ['JavaScript'], 'Node.js docs; The Odin Project Node path', 'Build a REST API with Node.js and a database'),
  s('Express', ['Express.js', 'ExpressJS', 'Expressjs'], 'technical', ['Node.js'], 'Express guide; Full Stack Open part 3', 'Build an authenticated notes API with Express', true),
  s('Spring Boot', ['spring', 'spring framework', 'spring mvc', 'spring security'], 'technical', ['Java'], 'Spring Guides; Spring Boot Academy', 'Build a REST API with Spring Boot, JPA, and validation'),
  s('Hibernate', ['jpa', 'spring data jpa'], 'technical', ['Java', 'SQL'], 'Hibernate ORM guide', 'Map a three-table schema with JPA relationships'),
  s('Django', ['django rest framework', 'drf'], 'technical', ['Python'], 'Django tutorial; Django REST framework tutorial', 'Build a job board with Django and an admin panel'),
  s('Flask', [], 'technical', ['Python'], 'Flask Mega-Tutorial', 'Build a small web app with Flask and SQLite'),
  s('FastAPI', [], 'technical', ['Python'], 'FastAPI tutorial', 'Build a typed REST API with FastAPI and tests'),
  s('.NET', ['asp.net', 'asp.net core', 'dotnet', '.net core', 'entity framework'], 'technical', ['C#'], 'Microsoft Learn ASP.NET Core path', 'Build a Web API with ASP.NET Core and Entity Framework'),
  s('REST APIs', ['restful', 'rest api', 'restful apis', 'restful services', 'web services'], 'technical', [], 'MDN HTTP; Microsoft REST API guidelines', 'Design and document an API with OpenAPI'),
  s('GraphQL', [], 'technical', ['REST APIs'], 'How to GraphQL', 'Add a GraphQL endpoint to an existing API'),
  s('Microservices', ['microservice architecture', 'micro services'], 'technical', ['REST APIs', 'Docker'], 'Building Microservices (Newman)', 'Split a monolith app into two services with a message queue'),
  s('Kafka', ['apache kafka', 'rabbitmq', 'message queues'], 'tool', ['Microservices'], 'Confluent Kafka 101', 'Stream events between two services with Kafka'),

  // Databases
  s('MySQL', [], 'tool', ['SQL'], 'MySQL tutorial; DBeaver', 'Design and index a schema for an online shop'),
  s('PostgreSQL', ['postgres', 'postgresql'], 'tool', ['SQL'], 'PostgreSQL tutorial; Use The Index, Luke', 'Tune slow queries with EXPLAIN and indexes'),
  s('MongoDB', ['mongo', 'mongoose', 'nosql'], 'tool', [], 'MongoDB University free courses', 'Build an API on MongoDB with aggregation queries'),
  s('Redis', [], 'tool', [], 'Redis University', 'Add caching with Redis and measure the speed-up'),
  s('Data modeling', ['database design', 'er diagrams', 'normalization', 'dimensional modeling'], 'technical', ['SQL'], 'Database Design for Mere Mortals', 'Model a hospital database to third normal form'),

  // Data and analytics
  s('Excel', ['MS Excel', 'MS-Excel', 'Microsoft Excel', 'Advanced Excel', 'VLOOKUP', 'XLOOKUP', 'Pivot Tables', 'pivot tables', 'Spreadsheets', 'spreadsheets'], 'tool', [], 'ExcelJet; Chandoo.org', 'Build a sales dashboard with pivot tables and XLOOKUP', true),
  s('Power BI', ['powerbi', 'dax'], 'tool', ['Excel'], 'Microsoft Learn Power BI path', 'Publish a Power BI report from a public dataset'),
  s('Tableau', [], 'tool', [], 'Tableau free training videos', 'Build a Tableau Public dashboard with filters'),
  s('Statistics', ['statistical analysis', 'probability', 'hypothesis testing', 'inferential statistics'], 'domain', [], 'Khan Academy Statistics; Think Stats', 'Run and explain an A/B test on sample data'),
  s('Pandas', [], 'tool', ['Python'], 'pandas getting started; Kaggle Pandas course', 'Clean and summarise a messy CSV with pandas'),
  s('NumPy', ['numpy'], 'tool', ['Python'], 'NumPy beginner guide', 'Implement simple statistics with NumPy arrays'),
  s('Data visualization', ['data visualisation', 'matplotlib', 'seaborn', 'plotly', 'dashboards'], 'technical', [], 'Storytelling with Data; Kaggle Data Visualization', 'Tell a story with five charts from one dataset'),
  s('ETL', ['data pipelines', 'elt', 'data integration'], 'technical', ['SQL', 'Python'], 'Data Engineering Zoomcamp', 'Build a daily pipeline from an API into a database'),
  s('Apache Spark', ['spark', 'pyspark', 'databricks'], 'tool', ['Python', 'SQL'], 'Spark: The Definitive Guide; Databricks Academy', 'Process a large CSV with PySpark'),
  s('Airflow', ['apache airflow'], 'tool', ['Python', 'ETL'], 'Astronomer Airflow guides', 'Schedule a pipeline with an Airflow DAG'),
  s('Snowflake', ['bigquery', 'redshift', 'data warehouse', 'data warehousing'], 'tool', ['SQL'], 'Snowflake free trial hands-on labs', 'Load data into a warehouse and model it with dbt'),
  s('dbt', ['data build tool'], 'tool', ['SQL'], 'dbt Fundamentals course', 'Build tested dbt models on top of raw tables'),

  // Machine learning
  s('Machine learning', ['ml', 'predictive modeling', 'supervised learning'], 'domain', ['Python', 'Statistics'], 'Hands-On Machine Learning (Géron); Andrew Ng ML Specialization', 'Train, evaluate, and explain a model on a Kaggle dataset'),
  s('scikit-learn', ['sklearn', 'scikit learn'], 'tool', ['Machine learning'], 'scikit-learn user guide', 'Build a pipeline with preprocessing and cross-validation'),
  s('Deep learning', ['neural networks', 'dl', 'cnn', 'rnn', 'transformers'], 'domain', ['Machine learning'], 'fast.ai Practical Deep Learning; Deep Learning Specialization', 'Fine-tune an image classifier on your own photos'),
  s('TensorFlow', ['keras', 'tensorflow 2'], 'tool', ['Deep learning'], 'TensorFlow tutorials', 'Train a text classifier with Keras'),
  s('PyTorch', ['torch'], 'tool', ['Deep learning'], 'PyTorch tutorials; Zero to Mastery PyTorch', 'Train a CNN in PyTorch and track experiments'),
  s('NLP', ['natural language processing', 'text mining', 'hugging face'], 'domain', ['Machine learning'], 'Hugging Face NLP course', 'Build a sentiment classifier for product reviews'),
  s('Computer vision', ['opencv', 'image processing'], 'domain', ['Deep learning'], 'PyImageSearch; OpenCV tutorials', 'Detect objects in a video with a pretrained model'),
  s('Generative AI', ['llm', 'llms', 'large language models', 'genai', 'prompt engineering', 'rag', 'langchain'], 'domain', ['Python'], 'DeepLearning.AI short courses; Hugging Face course', 'Build a document question-answering app with a local model'),
  s('MLOps', ['mlflow', 'model deployment', 'ml ops'], 'domain', ['Machine learning', 'Docker'], 'Made With ML; MLOps Zoomcamp', 'Deploy a model as an API with monitoring'),

  // Cloud and DevOps
  s('Docker', ['containers', 'containerization', 'dockerfile', 'docker compose'], 'tool', ['Linux'], 'Docker docs Get Started; Play with Docker', 'Containerise a web app and its database with Compose'),
  s('Kubernetes', ['k8s', 'helm', 'eks', 'aks', 'gke'], 'tool', ['Docker'], 'Kubernetes basics tutorial; KodeKloud', 'Deploy an app to a local cluster with kind'),
  s('CI/CD', ['ci cd', 'continuous integration', 'continuous delivery', 'continuous deployment', 'devops pipelines'], 'technical', ['Git'], 'GitHub Actions docs; Continuous Delivery (Humble)', 'Add a pipeline that tests and deploys on every push'),
  s('Jenkins', [], 'tool', ['CI/CD'], 'Jenkins user handbook', 'Build a Jenkins pipeline for a Java project'),
  s('GitHub Actions', [], 'tool', ['CI/CD'], 'GitHub Actions docs', 'Automate tests and releases with GitHub Actions'),
  s('Terraform', ['infrastructure as code', 'iac'], 'tool', ['AWS'], 'HashiCorp Terraform tutorials', 'Provision a small cloud setup with Terraform'),
  s('Ansible', [], 'tool', ['Linux'], 'Ansible getting started', 'Configure two servers with an Ansible playbook'),
  s('AWS', ['amazon web services', 'ec2', 'aws lambda', 'aws cloud'], 'tool', ['Linux'], 'AWS Skill Builder; AWS Cloud Practitioner Essentials', 'Host a web app on AWS with S3, EC2, and a database'),
  s('Azure', ['microsoft azure', 'azure devops'], 'tool', [], 'Microsoft Learn AZ-900 path', 'Deploy a web app to Azure App Service'),
  s('GCP', ['google cloud', 'google cloud platform'], 'tool', [], 'Google Cloud Skills Boost', 'Deploy a container to Cloud Run'),
  s('Networking', ['computer networks', 'computer networking', 'tcp/ip', 'ccna'], 'domain', [], 'Computer Networking: A Top-Down Approach; Professor Messer Network+', 'Trace a web request from DNS to response and explain each step'),
  s('Monitoring tools', ['prometheus', 'grafana', 'observability', 'elk stack', 'datadog'], 'tool', ['Linux'], 'Prometheus and Grafana getting started', 'Add metrics and a Grafana dashboard to an app'),

  // Testing
  s('Manual testing', ['software testing', 'test cases', 'functional testing', 'regression testing', 'qa testing'], 'technical', ['SDLC'], 'ISTQB Foundation syllabus; Guru99 testing tutorials', 'Write test cases and bug reports for a real website'),
  s('Selenium', ['selenium webdriver'], 'tool', ['Manual testing'], 'Selenium docs; Test Automation University', 'Automate a login and checkout flow with Selenium'),
  s('Test automation', ['automation testing', 'automated testing', 'cypress', 'playwright'], 'technical', ['Manual testing'], 'Test Automation University; Playwright docs', 'Build an automated end-to-end suite with reports'),
  s('API testing', ['postman', 'rest assured', 'rest-assured'], 'technical', ['REST APIs'], 'Postman Learning Center', 'Write a Postman collection with tests for a public API'),
  s('JUnit', ['testng', 'mockito'], 'tool', ['Java'], 'JUnit 5 user guide', 'Unit-test a Java service with JUnit and Mockito'),
  s('Performance testing', ['jmeter', 'load testing', 'k6'], 'technical', ['Manual testing'], 'Apache JMeter user manual', 'Load-test an API and report its limits'),

  // Mobile
  s('Android', ['android development', 'android studio', 'jetpack compose'], 'technical', ['Kotlin'], 'Android Basics with Compose', 'Publish a small Android app to a test track'),
  s('iOS', ['ios development', 'xcode', 'uikit'], 'technical', ['Swift'], 'Apple iOS App Dev Tutorials', 'Build an iOS app that uses an API'),
  s('Flutter', [], 'technical', ['Dart'], 'Flutter codelabs', 'Build a cross-platform expense tracker with Flutter'),
  s('React Native', ['expo'], 'technical', ['React'], 'React Native docs; Expo tutorial', 'Build a mobile app with Expo and publish a preview'),

  // Design
  s('Figma', ['adobe xd'], 'tool', [], 'Figma Learn; Figma YouTube tutorials', 'Design a three-screen app in Figma with components'),
  s('UI design', ['user interface design', 'visual design', 'typography'], 'domain', [], 'Refactoring UI; Google Material Design guidelines', 'Redesign an existing app screen and explain each choice'),
  s('UX research', ['user research', 'usability testing', 'user interviews', 'ux design', 'user experience'], 'domain', [], 'Google UX Design Certificate; Nielsen Norman Group articles', 'Interview five users and turn findings into a redesign'),
  s('Wireframing', ['prototyping', 'wireframes', 'user flows'], 'technical', [], 'Figma prototyping guides', 'Wireframe and prototype a sign-up flow'),
  s('Design systems', ['component library', 'style guide'], 'technical', ['UI design', 'Figma'], 'Design Systems handbook (InVision)', 'Build a small component library in Figma'),

  // Security
  s('Network security', ['firewalls', 'ids/ips', 'vpn'], 'domain', ['Networking'], 'CompTIA Security+ study guides; Professor Messer', 'Harden a home lab network and document it'),
  s('OWASP', ['owasp top 10', 'web application security', 'appsec'], 'domain', ['HTML', 'REST APIs'], 'OWASP Top 10; PortSwigger Web Security Academy', 'Complete ten PortSwigger labs and write up the fixes'),
  s('Penetration testing', ['ethical hacking', 'pentesting', 'vapt', 'burp suite', 'metasploit'], 'domain', ['Networking', 'Linux'], 'TryHackMe paths; Hack The Box Academy', 'Finish a TryHackMe learning path'),
  s('SIEM', ['splunk', 'qradar', 'security monitoring', 'soc'], 'tool', ['Network security'], 'Splunk free training; Blue Team Labs Online', 'Investigate a sample incident in Splunk'),
  s('Incident response', ['threat analysis', 'digital forensics'], 'domain', ['SIEM'], 'NIST SP 800-61 guide', 'Write an incident report for a simulated breach'),

  // Product and business
  s('Product management', ['product strategy', 'product roadmap', 'product thinking'], 'domain', [], 'Inspired (Cagan); Lenny’s Newsletter', 'Write a product spec for a feature with goals and metrics'),
  s('Requirements gathering', ['requirement analysis', 'requirements analysis', 'brd', 'frd', 'user stories'], 'domain', [], 'IIBA BABOK overview; User Story Mapping', 'Write user stories and acceptance criteria for an app'),
  s('Business analysis', ['business analyst skills', 'process mapping', 'gap analysis', 'bpmn'], 'domain', ['Requirements gathering'], 'IIBA ECBA resources', 'Map a business process and suggest improvements'),
  s('Stakeholder management', ['stakeholder communication', 'client communication', 'client handling'], 'soft', [], 'Harvard ManageMentor articles; Crucial Conversations', 'Run a mock requirements meeting and send the summary'),
  s('A/B testing', ['experimentation', 'ab testing'], 'domain', ['Statistics'], 'Trustworthy Online Controlled Experiments', 'Design an A/B test with a hypothesis and sample size'),
  s('Product analytics', ['google analytics', 'mixpanel', 'amplitude', 'product metrics'], 'domain', ['SQL'], 'Amplitude Academy; Google Analytics courses', 'Define and track KPIs for a feature'),

  // Soft skills
  s('Communication', ['communication skills', 'written communication', 'verbal communication'], 'soft', [], 'Toastmasters; On Writing Well', 'Write a weekly project update for a month'),
  s('Problem solving', ['analytical skills', 'critical thinking', 'analytical thinking'], 'soft', [], 'How to Solve It (Pólya)', 'Explain how you solved a hard bug, step by step'),
  s('Teamwork', ['collaboration', 'team player'], 'soft', [], 'The Five Dysfunctions of a Team', 'Contribute to an open-source project through reviews'),
  s('Presentation', ['presentation skills', 'public speaking'], 'soft', [], 'TED Talks (Anderson)', 'Give a ten-minute talk about a project you built'),
  s('Time management', ['prioritization', 'prioritisation'], 'soft', [], 'Getting Things Done; Deep Work', 'Plan and track a month of study in SkillPilot'),
  s('Leadership', ['mentoring', 'team leadership'], 'soft', [], 'The Manager’s Path', 'Mentor a beginner through their first project')
]

const r = (id: string, title: string, aliases: string[], summary: string, needs: LibraryRole['needs']): LibraryRole => ({
  id,
  title,
  aliases,
  summary,
  needs
})

export const LIBRARY_ROLES: LibraryRole[] = [
  r('software-engineer', 'Software Engineer', ['software developer', 'sde', 'sde 1', 'associate software engineer', 'graduate engineer trainee', 'get', 'programmer'], 'Writes, tests, and maintains software. Interviews focus on DSA, one language, and fundamentals.', [
    ['Data structures and algorithms', 3, 3], ['OOP', 3, 3], ['Java', 3, 2], ['Python', 2, 2], ['SQL', 2, 2], ['Git', 2, 2], ['System design', 1, 1], ['Linux', 2, 1], ['Problem solving', 3, 3], ['Communication', 2, 2]
  ]),
  r('frontend-developer', 'Frontend Developer', ['front end developer', 'front-end developer', 'react developer', 'ui developer', 'web developer'], 'Builds the parts of websites and apps people see and use.', [
    ['HTML', 3, 3], ['CSS', 3, 3], ['JavaScript', 3, 3], ['React', 3, 3], ['TypeScript', 2, 2], ['Responsive design', 3, 2], ['Git', 2, 2], ['REST APIs', 2, 2], ['Web accessibility', 2, 1], ['Jest', 1, 1], ['Next.js', 1, 1], ['Communication', 2, 2]
  ]),
  r('backend-developer', 'Backend Developer', ['back end developer', 'back-end developer', 'node developer', 'node.js developer', 'api developer'], 'Builds the servers, APIs, and data behind applications.', [
    ['Node.js', 3, 3], ['JavaScript', 3, 3], ['Express', 3, 2], ['REST APIs', 3, 3], ['SQL', 3, 3], ['MongoDB', 2, 2], ['Git', 2, 2], ['Docker', 1, 2], ['TypeScript', 2, 1], ['Redis', 1, 1], ['System design', 1, 1], ['Data structures and algorithms', 2, 2]
  ]),
  r('java-developer', 'Java Developer', ['java backend developer', 'java spring boot developer', 'j2ee developer', 'spring boot developer'], 'Builds enterprise back ends with Java and Spring.', [
    ['Java', 4, 3], ['Spring Boot', 3, 3], ['OOP', 3, 3], ['SQL', 3, 3], ['Hibernate', 2, 2], ['REST APIs', 3, 3], ['Microservices', 2, 2], ['JUnit', 2, 2], ['Git', 2, 2], ['Data structures and algorithms', 3, 2], ['Docker', 1, 1], ['Kafka', 1, 1]
  ]),
  r('python-developer', 'Python Developer', ['python backend developer', 'django developer', 'python engineer'], 'Builds back ends, scripts, and tools with Python.', [
    ['Python', 4, 3], ['Django', 3, 2], ['FastAPI', 2, 2], ['Flask', 2, 1], ['REST APIs', 3, 3], ['SQL', 3, 3], ['Git', 2, 2], ['OOP', 3, 2], ['Docker', 1, 1], ['Linux', 2, 2], ['Data structures and algorithms', 2, 2]
  ]),
  r('full-stack-developer', 'Full Stack Developer', ['full-stack developer', 'fullstack developer', 'mern stack developer', 'mean stack developer', 'mern developer'], 'Builds both the front and back ends of web applications.', [
    ['HTML', 3, 3], ['CSS', 3, 2], ['JavaScript', 3, 3], ['React', 3, 3], ['Node.js', 3, 3], ['Express', 2, 2], ['MongoDB', 2, 2], ['SQL', 2, 2], ['REST APIs', 3, 3], ['Git', 2, 2], ['TypeScript', 2, 1], ['Docker', 1, 1], ['System design', 1, 1]
  ]),
  r('dotnet-developer', '.NET Developer', ['c# developer', 'asp.net developer', 'dot net developer'], 'Builds applications and APIs on the Microsoft stack.', [
    ['C#', 4, 3], ['.NET', 3, 3], ['SQL', 3, 3], ['REST APIs', 3, 3], ['OOP', 3, 3], ['Azure', 1, 1], ['Git', 2, 2], ['JavaScript', 2, 1], ['Angular', 1, 1], ['Data structures and algorithms', 2, 2]
  ]),
  r('data-analyst', 'Data Analyst', ['business data analyst', 'mis analyst', 'reporting analyst', 'analytics analyst'], 'Turns data into reports, dashboards, and answers for the business.', [
    ['SQL', 3, 3], ['Excel', 4, 3], ['Power BI', 3, 3], ['Tableau', 2, 1], ['Python', 2, 2], ['Pandas', 2, 2], ['Statistics', 3, 3], ['Data visualization', 3, 3], ['Communication', 3, 3], ['Problem solving', 3, 2]
  ]),
  r('data-scientist', 'Data Scientist', ['ml scientist', 'applied scientist', 'junior data scientist'], 'Builds models and analyses that predict and explain.', [
    ['Python', 4, 3], ['Statistics', 4, 3], ['Machine learning', 3, 3], ['scikit-learn', 3, 3], ['Pandas', 3, 3], ['NumPy', 3, 2], ['SQL', 3, 3], ['Data visualization', 3, 2], ['Deep learning', 2, 1], ['NLP', 1, 1], ['Communication', 3, 2]
  ]),
  r('data-engineer', 'Data Engineer', ['big data engineer', 'etl developer', 'analytics engineer'], 'Builds the pipelines and warehouses data teams rely on.', [
    ['SQL', 4, 3], ['Python', 3, 3], ['ETL', 3, 3], ['Apache Spark', 3, 3], ['Airflow', 2, 2], ['Snowflake', 2, 2], ['Data modeling', 3, 3], ['AWS', 2, 2], ['Kafka', 1, 1], ['dbt', 1, 1], ['Linux', 2, 2], ['Git', 2, 2]
  ]),
  r('ml-engineer', 'Machine Learning Engineer', ['ml engineer', 'ai engineer', 'ai/ml engineer', 'genai engineer', 'deep learning engineer'], 'Builds, deploys, and maintains machine learning systems.', [
    ['Python', 4, 3], ['Machine learning', 3, 3], ['Deep learning', 3, 3], ['PyTorch', 3, 2], ['TensorFlow', 2, 1], ['MLOps', 2, 2], ['Docker', 2, 2], ['SQL', 2, 2], ['Generative AI', 2, 2], ['Data structures and algorithms', 2, 2], ['Statistics', 3, 2], ['Git', 2, 2]
  ]),
  r('devops-engineer', 'DevOps Engineer', ['site reliability engineer', 'sre', 'devops', 'platform engineer', 'build and release engineer'], 'Automates building, testing, deploying, and running software.', [
    ['Linux', 4, 3], ['Bash', 3, 3], ['Git', 3, 3], ['Docker', 3, 3], ['Kubernetes', 3, 3], ['CI/CD', 3, 3], ['Jenkins', 2, 2], ['AWS', 3, 3], ['Terraform', 2, 2], ['Ansible', 2, 1], ['Monitoring tools', 2, 2], ['Python', 2, 2], ['Networking', 2, 2]
  ]),
  r('cloud-engineer', 'Cloud Engineer', ['aws engineer', 'cloud administrator', 'azure engineer', 'cloud support engineer', 'cloud architect'], 'Builds and runs infrastructure in the cloud.', [
    ['AWS', 4, 3], ['Azure', 2, 1], ['Linux', 3, 3], ['Networking', 3, 3], ['Terraform', 3, 2], ['Docker', 2, 2], ['Kubernetes', 2, 2], ['Bash', 2, 2], ['Python', 2, 2], ['Monitoring tools', 2, 2], ['Network security', 2, 2]
  ]),
  r('qa-engineer', 'QA Engineer', ['software tester', 'test engineer', 'quality analyst', 'manual tester', 'qa analyst', 'automation tester'], 'Finds problems before users do, by hand and with automation.', [
    ['Manual testing', 4, 3], ['SDLC', 3, 3], ['Selenium', 3, 2], ['Test automation', 3, 2], ['API testing', 3, 2], ['SQL', 2, 2], ['Java', 2, 2], ['Jira', 2, 2], ['Agile', 2, 2], ['Performance testing', 1, 1], ['Communication', 3, 2]
  ]),
  r('sdet', 'SDET', ['software development engineer in test', 'automation engineer', 'test automation engineer'], 'Builds the frameworks and tools that test software automatically.', [
    ['Java', 3, 3], ['Selenium', 3, 3], ['Test automation', 4, 3], ['API testing', 3, 3], ['JUnit', 3, 2], ['CI/CD', 2, 2], ['Git', 2, 2], ['SQL', 2, 2], ['Data structures and algorithms', 2, 2], ['Docker', 1, 1]
  ]),
  r('android-developer', 'Android Developer', ['android engineer', 'mobile developer android'], 'Builds apps for Android phones.', [
    ['Kotlin', 4, 3], ['Android', 4, 3], ['Java', 2, 1], ['REST APIs', 3, 2], ['Git', 2, 2], ['OOP', 3, 2], ['SQL', 2, 1], ['Design patterns', 2, 2], ['Data structures and algorithms', 2, 2]
  ]),
  r('ios-developer', 'iOS Developer', ['ios engineer', 'swift developer', 'iphone developer'], 'Builds apps for iPhone and iPad.', [
    ['Swift', 4, 3], ['iOS', 4, 3], ['REST APIs', 3, 2], ['Git', 2, 2], ['OOP', 3, 2], ['Design patterns', 2, 2], ['Data structures and algorithms', 2, 2]
  ]),
  r('flutter-developer', 'Flutter Developer', ['cross platform developer', 'mobile app developer', 'react native developer'], 'Builds apps for Android and iOS from one code base.', [
    ['Flutter', 4, 3], ['Dart', 3, 3], ['REST APIs', 3, 2], ['Git', 2, 2], ['Android', 1, 1], ['iOS', 1, 1], ['React Native', 1, 1], ['UI design', 2, 1]
  ]),
  r('ui-ux-designer', 'UI/UX Designer', ['ux designer', 'ui designer', 'product designer', 'ux/ui designer', 'interaction designer'], 'Researches users and designs how products look and work.', [
    ['Figma', 4, 3], ['UI design', 4, 3], ['UX research', 3, 3], ['Wireframing', 3, 3], ['Design systems', 2, 2], ['Web accessibility', 2, 2], ['HTML', 1, 1], ['CSS', 1, 1], ['Communication', 3, 3], ['Presentation', 3, 2]
  ]),
  r('product-manager', 'Product Manager', ['associate product manager', 'apm', 'product owner', 'pm'], 'Decides what to build and why, and leads it to launch.', [
    ['Product management', 3, 3], ['Requirements gathering', 3, 3], ['Product analytics', 3, 3], ['SQL', 2, 2], ['A/B testing', 2, 2], ['Agile', 3, 2], ['Jira', 2, 1], ['Stakeholder management', 3, 3], ['Communication', 4, 3], ['UX research', 2, 2]
  ]),
  r('business-analyst', 'Business Analyst', ['ba', 'it business analyst', 'functional analyst', 'business systems analyst'], 'Connects business needs to the software built for them.', [
    ['Business analysis', 3, 3], ['Requirements gathering', 4, 3], ['SQL', 3, 2], ['Excel', 3, 3], ['Power BI', 2, 2], ['Agile', 3, 2], ['Jira', 2, 2], ['Stakeholder management', 3, 3], ['Communication', 4, 3], ['Data visualization', 2, 1]
  ]),
  r('cybersecurity-analyst', 'Cybersecurity Analyst', ['security analyst', 'soc analyst', 'information security analyst', 'cyber security analyst', 'security engineer'], 'Protects systems and responds to security threats.', [
    ['Networking', 3, 3], ['Network security', 3, 3], ['Linux', 3, 3], ['SIEM', 3, 3], ['Incident response', 2, 2], ['OWASP', 2, 2], ['Penetration testing', 2, 1], ['Python', 2, 2], ['Bash', 2, 1], ['Communication', 3, 2]
  ])
]

// Lookups ---------------------------------------------------------------------------------------

const plain = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/\s+/g, ' ')
    .trim()

const byName = new Map<string, LibrarySkill>()
for (const skill of LIBRARY_SKILLS) {
  for (const name of [skill.name, ...skill.aliases]) {
    const key = plain(name)
    if (!byName.has(key)) byName.set(key, skill)
  }
}

/** The library's skill for any of its names, ignoring case. */
export function findSkill(name: string): LibrarySkill | null {
  return byName.get(plain(name)) ?? null
}

/** The usual name of a skill, so "react.js", "ReactJS", and "React" all count as one. */
export function canonicalSkillName(name: string): string {
  return findSkill(name)?.name ?? name.trim()
}

/** The library role best matching a title, such as "Jr. React Developer" or "SDE 1". */
export function findRole(title: string): LibraryRole | null {
  const wanted = plain(title)
    .replace(/[^a-z0-9/+#. ]/g, ' ')
    .replace(/\b(?:junior|jr|senior|sr|lead|associate|trainee|intern|fresher|entry level|i|ii|iii|1|2)\b\.?/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!wanted) return null
  for (const role of LIBRARY_ROLES) {
    if ([role.title, ...role.aliases].some((name) => plain(name) === wanted)) return role
  }
  let best: { role: LibraryRole; length: number } | null = null
  for (const role of LIBRARY_ROLES) {
    for (const name of [role.title, ...role.aliases]) {
      const key = plain(name)
      if (key.length > 3 && (wanted.includes(key) || key.includes(wanted)) && (!best || key.length > best.length)) {
        best = { role, length: key.length }
      }
    }
  }
  return best?.role ?? null
}

export function libraryRole(id: string): LibraryRole | null {
  return LIBRARY_ROLES.find((role) => role.id === id) ?? null
}

const escape = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** One pattern per skill, matching any of its names as a whole word. */
const patterns = LIBRARY_SKILLS.map((skill) => {
  const names = [skill.name, ...skill.aliases].sort((a, b) => b.length - a.length).map(escape)
  // Whole words only: "Java" is not found in "JavaScript", nor C in "C++", nor R in "R&D".
  const body = `(?<![A-Za-z0-9+#.&-])(?:${names.join('|')})(?![A-Za-z0-9+#&-]|\\.[A-Za-z])`
  return { skill, pattern: new RegExp(body, skill.exactCase ? 'g' : 'gi') }
})

/** The library skills a piece of text mentions, such as a job description, most mentioned first. */
export function skillsInText(text: string): { skill: LibrarySkill; mentions: number }[] {
  const found: { skill: LibrarySkill; mentions: number }[] = []
  for (const { skill, pattern } of patterns) {
    pattern.lastIndex = 0
    const mentions = text.match(pattern)?.length ?? 0
    if (mentions > 0) found.push({ skill, mentions })
  }
  return found.sort((a, b) => b.mentions - a.mentions || a.skill.name.localeCompare(b.skill.name))
}

/** Orders skills so that each comes after the skills it builds on, keeping the given order otherwise. */
export function inLearningOrder(names: string[]): string[] {
  const wanted = new Set(names.map(canonicalSkillName))
  const ordered: string[] = []
  const visit = (name: string, path: Set<string>): void => {
    if (ordered.includes(name) || path.has(name)) return
    path.add(name)
    for (const first of findSkill(name)?.after ?? []) if (wanted.has(first)) visit(first, path)
    ordered.push(name)
  }
  for (const name of names.map(canonicalSkillName)) visit(name, new Set())
  return ordered
}
