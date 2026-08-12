import React, { useState, useMemo, useEffect } from "react";
import "./App.css";
import { supabase } from "./supabase";
const initialStore = {
  students: [],      // {username, name, regNo, branch, cgpa, skills[], resume}
  openings: [],      // {id, company, role, skills[], ctc, details, postedBy}
  applications: []   // {studentUsername, openingId, status: "applied" | "placed"}
};

const knownSkillKeywords = [
  "java", "python", "c++", "c", "javascript", "react", "angular", "node", "express",
  "spring", "django", "flask", "sql", "mysql", "postgres", "mongodb", "html", "css",
  "machine learning", "deep learning", "data science", "nlp", "aws", "azure", "gcp",
  "docker", "kubernetes", "git", "devops", "data structures", "algorithms", "dsa"
];

const parseSkills = str =>
  (str || "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean)
    .map(s => s.toLowerCase());

const computeMatchScore = (student, requiredSkills) => {
  const stuSkills = student.skills || [];
  if (!requiredSkills.length || !stuSkills.length) return 0;
  const set = new Set(stuSkills);
  let overlap = 0;
  requiredSkills.forEach(s => set.has(s) && overlap++);
  return Math.round((overlap / requiredSkills.length) * 100);
};

const extractSkillsFromText = text => {
  const lower = text.toLowerCase();
  const found = [];
  knownSkillKeywords.forEach(skill => {
    if (lower.includes(skill)) found.push(skill);
  });
  return Array.from(new Set(found));
};

function App() {
  const [store, setStore] = useState(initialStore);
  const [currentRole, setCurrentRole] = useState(null); // "recruiter" | "student" | "placement"
  const [currentUser, setCurrentUser] = useState(null); // {role, username}
  const [activeSection, setActiveSection] = useState(null); // "login" | role

  // auth
  const [authMode, setAuthMode] = useState("login"); // "login" | "signup"
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [signupUsername, setSignupUsername] = useState("");
  const [authError, setAuthError] = useState("");
  const [authNotice, setAuthNotice] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [sessionLoading, setSessionLoading] = useState(true);

  // recruiter form
  const [recCompanyName, setRecCompanyName] = useState("");
  const [recRole, setRecRole] = useState("");
  const [recSkills, setRecSkills] = useState("");
  const [recCtc, setRecCtc] = useState("");
  const [recDetails, setRecDetails] = useState("");

  // recruiter resume selection
  const [selectedStudentForResume, setSelectedStudentForResume] = useState(null);

  // student profile
  const [stuName, setStuName] = useState("");
  const [stuRegNo, setStuRegNo] = useState("");
  const [stuBranch, setStuBranch] = useState("");
  const [stuCgpa, setStuCgpa] = useState("");
  const [stuSkills, setStuSkills] = useState("");
  const [stuResume, setStuResume] = useState("");
  const [stuSaveStatus, setStuSaveStatus] = useState("Not saved yet.");

  // placement filters
  const [placementCompanyFilter, setPlacementCompanyFilter] = useState("");
  const [placementStatusFilter, setPlacementStatusFilter] = useState("");
  const [matchingOpeningId, setMatchingOpeningId] = useState("");

  // skill extraction
  const [skillExtractInput, setSkillExtractInput] = useState("");
  const [skillExtractOutput, setSkillExtractOutput] = useState([]);

  // chatbot
  const [chatMessages, setChatMessages] = useState([
    {
      role: "bot",
      text:
        "Hi, I’m your Placement Assistant. Ask me how to increase placements, " +
        "improve student profiles, or boost company participation."
    }
  ]);
  const [chatInput, setChatInput] = useState("");

  const loginRoleLabel =
    currentRole === "recruiter"
      ? "Recruiter"
      : currentRole === "student"
      ? "Student"
      : currentRole === "placement"
      ? "Placement Cell"
      : "";

  const handleSelectRole = role => {
    setCurrentRole(role);
    setActiveSection(currentUser ? currentUser.role === role ? currentUser.role : "login" : "login");
    setAuthError("");
    setAuthNotice("");
  };

  const enterDashboardForUser = user => {
    setCurrentUser(user);
    setCurrentRole(user.role);
    if (user.role === "recruiter") {
      setActiveSection("recruiter");
    } else if (user.role === "student") {
      setActiveSection("student");
      const existing = store.students.find(s => s.username === user.username);
      if (existing) {
        setStuName(existing.name || "");
        setStuRegNo(existing.regNo || "");
        setStuBranch(existing.branch || "");
        setStuCgpa(existing.cgpa || "");
        setStuSkills((existing.skills || []).join(", "));
        setStuResume(existing.resume || "");
        setStuSaveStatus("Profile loaded.");
      } else {
        setStuName("");
        setStuRegNo("");
        setStuBranch("");
        setStuCgpa("");
        setStuSkills("");
        setStuResume("");
        setStuSaveStatus("Not saved yet.");
      }
    } else if (user.role === "placement") {
      setActiveSection("placement");
    }
  };

  // Restore session on load, and stay in sync with Supabase auth state.
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const meta = session?.user?.user_metadata;
      if (session && meta?.role && meta?.username) {
        enterDashboardForUser({ role: meta.role, username: meta.username, email: session.user.email });
      }
      setSessionLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        setCurrentUser(null);
        setActiveSection(null);
      }
    });

    return () => listener.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setCurrentUser(null);
    setActiveSection(null);
  };

  const handleLogin = async e => {
    e.preventDefault();
    setAuthError("");
    setAuthNotice("");
    if (!currentRole) {
      setAuthError("Select a role first.");
      return;
    }
    setAuthLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({
      email: loginEmail.trim(),
      password: loginPassword
    });
    setAuthLoading(false);

    if (error) {
      setAuthError(error.message);
      return;
    }

    const meta = data.user.user_metadata || {};
    if (meta.role !== currentRole) {
      await supabase.auth.signOut();
      setAuthError(
        meta.role
          ? `This account is registered as "${meta.role}". Select that role to log in.`
          : "This account has no role on file. Please sign up again."
      );
      return;
    }

    setLoginPassword("");
    enterDashboardForUser({ role: meta.role, username: meta.username, email: data.user.email });
  };

  const handleSignup = async e => {
    e.preventDefault();
    setAuthError("");
    setAuthNotice("");
    if (!currentRole) {
      setAuthError("Select a role first.");
      return;
    }
    if (!signupUsername.trim()) {
      setAuthError("Enter a display name.");
      return;
    }
    if (loginPassword.length < 6) {
      setAuthError("Password must be at least 6 characters.");
      return;
    }
    setAuthLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email: loginEmail.trim(),
      password: loginPassword,
      options: { data: { role: currentRole, username: signupUsername.trim() } }
    });
    setAuthLoading(false);

    if (error) {
      setAuthError(error.message);
      return;
    }

    if (!data.session) {
      // Email confirmation is required by the Supabase project's auth settings.
      setAuthNotice("Account created. Check your email to confirm before logging in.");
      setAuthMode("login");
      return;
    }

    setLoginPassword("");
    enterDashboardForUser({ role: currentRole, username: signupUsername.trim(), email: data.user.email });
  };

  const handlePostRequirement = () => {
    if (!currentUser || currentUser.role !== "recruiter") {
      alert("Please login as a recruiter.");
      return;
    }
    const company = recCompanyName.trim();
    const role = recRole.trim();
    const skills = parseSkills(recSkills);
    const ctc = recCtc.trim();
    const details = recDetails.trim();
    if (!company || !role || skills.length === 0) {
      alert("Please fill at least company, role, and required skills.");
      return;
    }
    const id = "open_" + (store.openings.length + 1);
    setStore(prev => ({
      ...prev,
      openings: [
        ...prev.openings,
        { id, company, role, skills, ctc, details, postedBy: currentUser.username }
      ]
    }));
    setRecCompanyName("");
    setRecRole("");
    setRecSkills("");
    setRecCtc("");
    setRecDetails("");
    alert("Requirement posted for students.");
  };

  const recruiterRequiredSkills = useMemo(() => parseSkills(recSkills), [recSkills]);

  const recruiterCandidates = useMemo(
    () =>
      store.students
        .map(stu => ({
          stu,
          score: computeMatchScore(stu, recruiterRequiredSkills)
        }))
        .sort((a, b) => b.score - a.score),
    [store.students, recruiterRequiredSkills]
  );

  const handleSaveStudentProfile = () => {
    if (!currentUser || currentUser.role !== "student") {
      alert("Please login as a student.");
      return;
    }
    const stu = {
      username: currentUser.username,
      name: stuName.trim() || currentUser.username,
      regNo: stuRegNo.trim(),
      branch: stuBranch.trim(),
      cgpa: stuCgpa.trim(),
      skills: parseSkills(stuSkills),
      resume: stuResume.trim()
    };
    setStore(prev => {
      const idx = prev.students.findIndex(s => s.username === stu.username);
      const students =
        idx >= 0
          ? prev.students.map((s, i) => (i === idx ? stu : s))
          : [...prev.students, stu];
      return { ...prev, students };
    });
    setStuSaveStatus("Profile saved.");
    setTimeout(() => setStuSaveStatus("Last saved just now."), 800);
  };

  const handleApplyToOpening = openingId => {
    if (!currentUser || currentUser.role !== "student") {
      alert("Login as student to apply.");
      return;
    }
    const hasProfile = store.students.find(s => s.username === currentUser.username);
    if (!hasProfile) {
      alert("Please save your student profile before applying.");
      return;
    }
    const already = store.applications.find(
      a => a.studentUsername === currentUser.username && a.openingId === openingId
    );
    if (already) return;

    setStore(prev => ({
      ...prev,
      applications: [
        ...prev.applications,
        { studentUsername: currentUser.username, openingId, status: "applied" }
      ]
    }));
    alert("Application submitted to recruiter.");
  };

  // derived placement overview
  const placementOverview = useMemo(() => {
    const placed = store.applications.filter(a => a.status === "placed");
    const uniquePlacedStudents = new Set(placed.map(a => a.studentUsername));
    const allStudentUsernames = new Set(store.students.map(s => s.username));
    const unplacedCount = allStudentUsernames.size - uniquePlacedStudents.size;

    const companies = new Set(
      placed
        .map(a => {
          const o = store.openings.find(o => o.id === a.openingId);
          return o ? o.company : "";
        })
        .filter(Boolean)
    );

    const activeCompanyNames = new Set(store.openings.map(o => o.company));

    return {
      placedCount: uniquePlacedStudents.size,
      unplacedCount: Math.max(unplacedCount, 0),
      placedCompaniesText: companies.size
        ? "Companies: " + Array.from(companies).join(", ")
        : "No students placed yet.",
      activeOpeningsText: activeCompanyNames.size
        ? "Active openings: " + Array.from(activeCompanyNames).join(", ")
        : "No active openings posted.",
      activeCompanyNames: Array.from(activeCompanyNames)
    };
  }, [store.students, store.applications, store.openings]);

  const placementStudentList = useMemo(() => {
    if (!store.students.length) return [];
    return store.students
      .map(stu => {
        const apps = store.applications.filter(a => a.studentUsername === stu.username);
        const placedApp = apps.find(a => a.status === "placed");
        const isPlaced = !!placedApp;
        const placedOpening = placedApp
          ? store.openings.find(o => o.id === placedApp.openingId)
          : null;
        const placedCompany = placedOpening ? placedOpening.company : null;
        return { stu, isPlaced, placedCompany };
      })
      .filter(item => {
        if (placementCompanyFilter && placementCompanyFilter !== (item.placedCompany || "")) {
          // if filtering by company, show only placed for that company
          if (!item.isPlaced) return false;
        }
        if (placementStatusFilter === "placed" && !item.isPlaced) return false;
        if (placementStatusFilter === "pending" && item.isPlaced) return false;
        return true;
      });
  }, [store.students, store.applications, store.openings, placementCompanyFilter, placementStatusFilter]);

  const matchingResults = useMemo(() => {
    if (!matchingOpeningId) return [];
    const opening = store.openings.find(o => o.id === matchingOpeningId);
    if (!opening) return [];
    return store.students
      .map(stu => ({
        stu,
        score: computeMatchScore(stu, opening.skills)
      }))
      .sort((a, b) => b.score - a.score);
  }, [matchingOpeningId, store.students, store.openings]);

  const skillExtractClick = () => {
    const skills = extractSkillsFromText(skillExtractInput);
    setSkillExtractOutput(skills);
  };

  const generateChatbotReply = question => {
    const q = question.toLowerCase();
    const tips = [];
    if (q.includes("increase") && q.includes("placements")) {
      tips.push(
        "1) Analyze skill gaps between job requirements and students, and run targeted bootcamps."
      );
      tips.push(
        "2) Conduct regular mock interviews with feedback from alumni & recruiters."
      );
      tips.push(
        "3) Track company feedback after each drive and convert into concrete action items."
      );
    }
    if (q.includes("resume") || q.includes("cv")) {
      tips.push(
        "1) Standardize a 1–2 page resume template with clear sections and measurable achievements."
      );
      tips.push(
        "2) Highlight 2–3 strong academic or personal projects aligned with target companies."
      );
      tips.push(
        "3) Add quantified outcomes (e.g., 'improved performance by 30%') instead of generic statements."
      );
    }
    if (q.includes("soft skill") || q.includes("communication")) {
      tips.push(
        "1) Run weekly group discussions and presentation sessions with scoring rubrics."
      );
      tips.push(
        "2) Record mock interviews so students can self-review their communication."
      );
    }
    if (q.includes("company") || q.includes("drive")) {
      tips.push(
        "1) Cluster companies by tech stack and create focused talent pools for each cluster."
      );
      tips.push(
        "2) Share anonymized matching scores and student readiness reports with companies."
      );
    }
    if (!tips.length) {
      tips.push(
        "Focus on three pillars: 1) skill–job alignment (using the job matching scores), 2) consistent interview practice, and 3) strong recruiter relationships with feedback loops."
      );
      tips.push(
        "You can ask more specific questions like: 'how to improve resume quality?', 'how to prepare for product companies?', or 'how to help low-CGPA students?'."
      );
    }
    return tips.join("\n\n");
  };

  const handleChatSubmit = e => {
    e.preventDefault();
    const text = chatInput.trim();
    if (!text) return;
    setChatMessages(prev => [...prev, { role: "user", text }]);
    setChatInput("");
    const reply = generateChatbotReply(text);
    setTimeout(() => {
      setChatMessages(prev => [...prev, { role: "bot", text: reply }]);
    }, 200);
  };

  const pageTitle =
    activeSection === "recruiter"
      ? "Recruiter Dashboard"
      : activeSection === "student"
      ? "Student Dashboard"
      : activeSection === "placement"
      ? "Placement Cell Dashboard"
      : currentRole
      ? `${loginRoleLabel} · Login`
      : "Welcome";

  const pageSubtitle =
    activeSection === "recruiter"
      ? "Post openings and discover matching candidates."
      : activeSection === "student"
      ? "Maintain your profile and apply to companies."
      : activeSection === "placement"
      ? "Monitor placements and optimize outcomes."
      : currentRole
      ? `Authenticate to access your ${loginRoleLabel} dashboard.`
      : "Select a role on the left to begin.";

  if (sessionLoading) {
    return (
      <div className="app-shell">
        <div className="main" style={{ alignItems: "center", justifyContent: "center" }}>
          <div className="muted">Checking session…</div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      {/* Sidebar */}
      <aside className="sidebar">
        <div>
          <div className="sidebar-header">
            <span>Campus Placement Hub</span>
          </div>
          <div className="muted" style={{ fontSize: "0.78rem", marginTop: "0.2rem" }}>
            Choose your role, login, and access your dashboard.
          </div>
        </div>

        <div>
          <div className="sidebar-section-title">Roles</div>
          <div className="role-list">
            <button
              className={`role-button ${currentRole === "recruiter" ? "active" : ""}`}
              onClick={() => handleSelectRole("recruiter")}
            >
              <span>Recruiter</span>
              <span className="role-badge">Company</span>
            </button>
            <button
              className={`role-button ${currentRole === "student" ? "active" : ""}`}
              onClick={() => handleSelectRole("student")}
            >
              <span>Student</span>
              <span className="role-badge">Candidate</span>
            </button>
            <button
              className={`role-button ${currentRole === "placement" ? "active" : ""}`}
              onClick={() => handleSelectRole("placement")}
            >
              <span>Placement Cell</span>
              <span className="role-badge">T&P</span>
            </button>
          </div>
        </div>

        <div>
          <div className="sidebar-section-title">Current Session</div>
          <div className="stacked">
            <div className="muted">
              {currentRole ? `Selected role: ${loginRoleLabel}` : "No role selected."}
            </div>
            <div className="muted">
              {currentUser ? `Logged in as: ${currentUser.username}` : "Not logged in."}
            </div>
            {currentUser && (
              <button className="secondary" onClick={handleLogout}>
                Logout
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="main">
        <div className="top-bar">
          <div className="top-bar-title">
            <h1>{pageTitle}</h1>
            <small>{pageSubtitle}</small>
          </div>
          <div className="badge">
            <span className="status-dot" />
            <span>Supabase Auth · Profile data in-memory</span>
          </div>
        </div>

        {/* Login */}
        {activeSection === "login" && (
          <section className="card" style={{ maxWidth: 500 }}>
            <div className="card-header">
              <div className="card-title">
                <span>{authMode === "login" ? "Login" : "Create account"}</span>
                <span className="pill">Step 1 · Authentication</span>
              </div>
            </div>
            <div className="muted" style={{ marginBottom: "0.7rem" }}>
              {authMode === "login"
                ? "Sign in with the email and password you registered with."
                : "Create a real account for this role. You'll use it to log in from now on."}{" "}
              <a
                onClick={() => {
                  setAuthMode(authMode === "login" ? "signup" : "login");
                  setAuthError("");
                  setAuthNotice("");
                }}
              >
                {authMode === "login" ? "Need an account? Sign up" : "Already have an account? Log in"}
              </a>
            </div>

            <form
              className="form-grid-1"
              onSubmit={authMode === "login" ? handleLogin : handleSignup}
            >
              <div>
                <label>Role</label>
                <input type="text" value={loginRoleLabel} disabled />
              </div>
              {authMode === "signup" && (
                <div>
                  <label>Display name</label>
                  <input
                    type="text"
                    value={signupUsername}
                    onChange={e => setSignupUsername(e.target.value)}
                    placeholder="e.g., acme_hr, s12345, tpo_admin"
                    required
                  />
                </div>
              )}
              <div>
                <label>Email</label>
                <input
                  type="email"
                  value={loginEmail}
                  onChange={e => setLoginEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                />
              </div>
              <div>
                <label>Password</label>
                <input
                  type="password"
                  value={loginPassword}
                  onChange={e => setLoginPassword(e.target.value)}
                  placeholder={authMode === "signup" ? "At least 6 characters" : "Your password"}
                  required
                  minLength={authMode === "signup" ? 6 : undefined}
                />
              </div>
              {authError && (
                <div className="muted" style={{ color: "#f87171" }}>
                  {authError}
                </div>
              )}
              {authNotice && (
                <div className="muted" style={{ color: "#4ade80" }}>
                  {authNotice}
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
                <button type="submit" disabled={authLoading}>
                  {authLoading ? "Please wait…" : authMode === "login" ? "Login" : "Sign up"}
                </button>
              </div>
            </form>
          </section>
        )}

        {/* Recruiter */}
        {activeSection === "recruiter" && (
          <section>
            <div className="grid">
              <div className="stacked">
                <div className="card">
                  <div className="card-header">
                    <div className="card-title">
                      Recruiter · Company Requirements
                      <span className="pill">Visible to students</span>
                    </div>
                  </div>
                  <div className="form-grid">
                    <div>
                      <label>Company Name</label>
                      <input
                        value={recCompanyName}
                        onChange={e => setRecCompanyName(e.target.value)}
                        placeholder="ACME Corp"
                      />
                    </div>
                    <div>
                      <label>Role / Position</label>
                      <input
                        value={recRole}
                        onChange={e => setRecRole(e.target.value)}
                        placeholder="Software Engineer"
                      />
                    </div>
                  </div>
                  <div className="form-grid-1">
                    <div>
                      <label>Required Skills (comma separated)</label>
                      <input
                        value={recSkills}
                        onChange={e => setRecSkills(e.target.value)}
                        placeholder="Java, React, SQL"
                      />
                    </div>
                    <div>
                      <label>CTC / Package (optional)</label>
                      <input
                        value={recCtc}
                        onChange={e => setRecCtc(e.target.value)}
                        placeholder="8 LPA"
                      />
                    </div>
                    <div>
                      <label>Additional Details</label>
                      <textarea
                        value={recDetails}
                        onChange={e => setRecDetails(e.target.value)}
                        placeholder="Job description, eligibility criteria, location..."
                      />
                    </div>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center"
                    }}
                  >
                    <span className="muted">
                      Posted openings appear under “View Companies” for students.
                    </span>
                    <button onClick={handlePostRequirement}>Post Requirement</button>
                  </div>
                </div>

                <div className="card">
                  <div className="card-header">
                    <div className="card-title">
                      Matching Candidates
                      <span className="pill">Auto-filtered by skills</span>
                    </div>
                  </div>
                  <div className="muted" style={{ marginBottom: "0.45rem" }}>
                    Based on your required skills, candidates are sorted by match score.
                  </div>
                  <div className="list">
                    {store.students.length === 0 ? (
                      <div className="muted" style={{ padding: "0.7rem" }}>
                        No student profiles saved yet.
                      </div>
                    ) : (
                      recruiterCandidates.map(({ stu, score }) => (
                        <div
                          key={stu.username}
                          className="list-item"
                          onClick={() => setSelectedStudentForResume(stu)}
                        >
                          <div className="list-item-main">
                            <div className="list-item-title">
                              {stu.name || stu.username}
                            </div>
                            <div className="list-item-sub">
                              {(stu.branch || "") +
                                (stu.cgpa ? ` · CGPA ${stu.cgpa}` : "")}
                            </div>
                            <div className="chip-row">
                              {(stu.skills || []).map(sk => (
                                <div key={sk} className="chip">
                                  {sk}
                                </div>
                              ))}
                            </div>
                          </div>
                          <div>
                            <div className="tag">{score}% match</div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              <div className="card">
                <div className="card-header">
                  <div className="card-title">
                    Candidate Resume
                    <span className="pill">
                      {selectedStudentForResume
                        ? selectedStudentForResume.name || selectedStudentForResume.username
                        : "No candidate selected"}
                    </span>
                  </div>
                </div>
                <div className="stacked">
                  <div className="muted">
                    Click a candidate name from the left to preview their resume and profile.
                  </div>
                  <div className="resume-view">
                    {selectedStudentForResume ? (
                      <>
                        {`Name: ${selectedStudentForResume.name || "-"}\n`}
                        {`Reg No: ${selectedStudentForResume.regNo || "-"}\n`}
                        {`Branch: ${selectedStudentForResume.branch || "-"}\n`}
                        {`CGPA: ${selectedStudentForResume.cgpa || "-"}\n`}
                        {`Skills: ${(selectedStudentForResume.skills || []).join(", ")}\n\n`}
                        {selectedStudentForResume.resume || "(No resume text saved)"}
                      </>
                    ) : (
                      "No resume selected."
                    )}
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Student */}
        {activeSection === "student" && (
          <section>
            <div className="grid">
              <div className="card">
                <div className="card-header">
                  <div className="card-title">
                    Student Profile
                    <span className="pill">Your details + resume</span>
                  </div>
                </div>
                <div className="form-grid">
                  <div>
                    <label>Full Name</label>
                    <input
                      value={stuName}
                      onChange={e => setStuName(e.target.value)}
                      placeholder="John Doe"
                    />
                  </div>
                  <div>
                    <label>Registration Number</label>
                    <input
                      value={stuRegNo}
                      onChange={e => setStuRegNo(e.target.value)}
                      placeholder="U20CS123"
                    />
                  </div>
                </div>
                <div className="form-grid">
                  <div>
                    <label>Branch</label>
                    <input
                      value={stuBranch}
                      onChange={e => setStuBranch(e.target.value)}
                      placeholder="CSE"
                    />
                  </div>
                  <div>
                    <label>CGPA</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max="10"
                      value={stuCgpa}
                      onChange={e => setStuCgpa(e.target.value)}
                      placeholder="8.2"
                    />
                  </div>
                </div>
                <div className="form-grid-1">
                  <div>
                    <label>Skills (comma separated)</label>
                    <input
                      value={stuSkills}
                      onChange={e => setStuSkills(e.target.value)}
                      placeholder="Java, DSA, React"
                    />
                  </div>
                  <div>
                    <label>Resume (paste text summary)</label>
                    <textarea
                      value={stuResume}
                      onChange={e => setStuResume(e.target.value)}
                      placeholder="Paste your resume summary or main points here..."
                    />
                  </div>
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center"
                  }}
                >
                  <span className="muted">{stuSaveStatus}</span>
                  <button onClick={handleSaveStudentProfile}>Save Profile</button>
                </div>
              </div>

              <div className="card">
                <div className="card-header">
                  <div className="card-title">
                    View Companies
                    <span className="pill">Openings from recruiters</span>
                  </div>
                </div>
                <div className="muted" style={{ marginBottom: "0.5rem" }}>
                  Click on a company and apply. Your profile will be shared with the recruiter.
                </div>
                <div className="list">
                  {store.openings.length === 0 ? (
                    <div className="muted" style={{ padding: "0.7rem" }}>
                      No openings posted yet.
                    </div>
                  ) : (
                    store.openings.map(open => {
                      const applied =
                        currentUser &&
                        store.applications.find(
                          a =>
                            a.studentUsername === currentUser.username &&
                            a.openingId === open.id
                        );
                      const appliedLabel =
                        applied && applied.status === "placed"
                          ? "Placed"
                          : applied
                          ? "Applied"
                          : null;

                      const disabled =
                        !currentUser || currentUser.role !== "student" || !!appliedLabel;

                      return (
                        <div key={open.id} className="list-item">
                          <div className="list-item-main">
                            <div className="list-item-title">
                              {open.company} · {open.role}
                            </div>
                            <div className="list-item-sub">
                              {(open.ctc ? open.ctc + " · " : "") +
                                "Skills: " +
                                open.skills.join(", ")}
                            </div>
                            {open.details && (
                              <div className="list-item-sub">{open.details}</div>
                            )}
                          </div>
                          <div>
                            <button
                              disabled={disabled}
                              onClick={e => {
                                e.stopPropagation();
                                handleApplyToOpening(open.id);
                              }}
                            >
                              {currentUser && currentUser.role !== "student"
                                ? "Login as student"
                                : !currentUser
                                ? "Login as student"
                                : appliedLabel || "Apply"}
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Placement Cell */}
        {activeSection === "placement" && (
          <section>
            <div className="grid">
              <div className="stacked">
                <div className="card">
                  <div className="card-header">
                    <div className="card-title">
                      Placement Overview
                      <span className="pill">Live dashboard</span>
                    </div>
                  </div>
                  <div className="form-grid">
                    <div>
                      <div className="section-label">Students Placed</div>
                      <div
                        style={{ fontSize: "1.4rem", fontWeight: 600 }}
                      >
                        {placementOverview.placedCount}
                      </div>
                      <div className="muted">{placementOverview.placedCompaniesText}</div>
                    </div>
                    <div>
                      <div className="section-label">Yet to be Placed</div>
                      <div
                        style={{ fontSize: "1.4rem", fontWeight: 600 }}
                      >
                        {placementOverview.unplacedCount}
                      </div>
                      <div className="muted">{placementOverview.activeOpeningsText}</div>
                    </div>
                  </div>
                  <div className="form-grid">
                    <div>
                      <label>Filter by company</label>
                      <select
                        value={placementCompanyFilter}
                        onChange={e => setPlacementCompanyFilter(e.target.value)}
                      >
                        <option value="">All companies</option>
                        {placementOverview.activeCompanyNames.map(name => (
                          <option key={name} value={name}>
                            {name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label>Filter by status</label>
                      <select
                        value={placementStatusFilter}
                        onChange={e => setPlacementStatusFilter(e.target.value)}
                      >
                        <option value="">All</option>
                        <option value="placed">Placed</option>
                        <option value="pending">Pending</option>
                      </select>
                    </div>
                  </div>
                  <div className="list">
                    {placementStudentList.length === 0 ? (
                      <div className="muted" style={{ padding: "0.7rem" }}>
                        No students matching the selected filters.
                      </div>
                    ) : (
                      placementStudentList.map(({ stu, isPlaced, placedCompany }) => (
                        <div
                          key={stu.username}
                          className="list-item"
                          style={{ cursor: "default" }}
                        >
                          <div className="list-item-main">
                            <div className="list-item-title">
                              {stu.name}
                              {stu.regNo ? ` · ${stu.regNo}` : ""}
                            </div>
                            <div className="list-item-sub">
                              {(stu.branch || "") +
                                (stu.cgpa ? ` · CGPA ${stu.cgpa}` : "")}
                            </div>
                            <div className="chip-row">
                              {(stu.skills || []).map(sk => (
                                <div key={sk} className="chip">
                                  {sk}
                                </div>
                              ))}
                            </div>
                          </div>
                          <div>
                            <div className="tag">
                              {isPlaced
                                ? `Placed${placedCompany ? " · " + placedCompany : ""}`
                                : "Pending"}
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="card">
                  <div className="card-header">
                    <div className="card-title">
                      Job Matching Model
                      <span className="pill">Skill-based scoring</span>
                    </div>
                  </div>
                  <div className="muted" style={{ marginBottom: "0.4rem" }}>
                    Select a company opening and we’ll calculate match scores for saved students based on skill overlap.
                  </div>
                  <div className="form-grid-1">
                    <div>
                      <label>Company Opening</label>
                      <select
                        value={matchingOpeningId}
                        onChange={e => setMatchingOpeningId(e.target.value)}
                      >
                        <option value="">Select opening</option>
                        {store.openings.map(open => (
                          <option key={open.id} value={open.id}>
                            {open.company} · {open.role}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="list">
                    {!matchingOpeningId ? (
                      <div className="muted" style={{ padding: "0.7rem" }}>
                        Select a company opening to see matching students.
                      </div>
                    ) : !matchingResults.length ? (
                      <div className="muted" style={{ padding: "0.7rem" }}>
                        No data available.
                      </div>
                    ) : (
                      matchingResults.map(({ stu, score }) => (
                        <div
                          key={stu.username}
                          className="list-item"
                          style={{ cursor: "default" }}
                        >
                          <div className="list-item-main">
                            <div className="list-item-title">
                              {stu.name}
                              {stu.regNo ? ` · ${stu.regNo}` : ""}
                            </div>
                            <div className="list-item-sub">
                              {`Match score ${score}% · Skills: ${(stu.skills || []).join(
                                ", "
                              )}`}
                            </div>
                          </div>
                          <div>
                            <div className="tag">
                              {score >= 70
                                ? "Strong match"
                                : score >= 40
                                ? "Medium match"
                                : "Low match"}
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              <div className="stacked">
                <div className="card">
                  <div className="card-header">
                    <div className="card-title">
                      Skill Extraction
                      <span className="pill">From resume text</span>
                    </div>
                  </div>
                  <div className="muted" style={{ marginBottom: "0.4rem" }}>
                    Paste a student resume snippet to auto-extract key skills (rule-based for demo).
                  </div>
                  <div className="form-grid-1">
                    <div>
                      <label>Resume Snippet</label>
                      <textarea
                        value={skillExtractInput}
                        onChange={e => setSkillExtractInput(e.target.value)}
                        placeholder="Paste lines from a resume..."
                      />
                    </div>
                    <div>
                      <label>Extracted Skills</label>
                      <div className="chip-row">
                        {skillExtractOutput.length ? (
                          skillExtractOutput.map(sk => (
                            <div key={sk} className="chip">
                              {sk}
                            </div>
                          ))
                        ) : (
                          <span className="muted">
                            No known skills detected. Try adding common tech keywords.
                          </span>
                        )}
                      </div>
                    </div>
                    <div style={{ display: "flex", justifyContent: "flex-end" }}>
                      <button onClick={skillExtractClick}>Extract Skills</button>
                    </div>
                  </div>
                </div>

                <div className="card">
                  <div className="card-header">
                    <div className="card-title">
                      Chatbot Placement Assistant
                      <span className="pill">Tips to increase placements</span>
                    </div>
                  </div>
                  <div className="chat-window">
                    {chatMessages.map((m, idx) => (
                      <div
                        key={idx}
                        className={`chat-msg ${m.role === "user" ? "user" : "bot"}`}
                      >
                        {m.text}
                      </div>
                    ))}
                  </div>
                  <form
                    onSubmit={handleChatSubmit}
                    style={{ marginTop: "0.45rem", display: "flex", gap: "0.4rem" }}
                  >
                    <input
                      type="text"
                      value={chatInput}
                      onChange={e => setChatInput(e.target.value)}
                      placeholder="Ask: how to increase placements, boost offers, improve resume..."
                    />
                    <button type="submit">Ask</button>
                  </form>
                </div>
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

export default App;
