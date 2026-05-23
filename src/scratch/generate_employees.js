const firstNames = ["Liam", "Zoe", "Ryan", "Alex", "Ethan", "Sarah", "Michael", "Priya", "James", "Emma", "Olivia", "Noah", "Ava", "Lucas", "Mia", "William", "Sophia", "Benjamin", "Isabella", "Mason", "Charlotte", "Jacob", "Amelia", "Logan", "Harper", "Alexander", "Evelyn", "Daniel", "Abigail", "Matthew", "Emily", "Henry", "Elizabeth", "Joseph", "Sofia", "Samuel", "Avery", "David", "Ella", "Jackson", "Scarlett", "Sebastian", "Madison", "Aiden", "Victoria", "John", "Grace", "Owen", "Chloe", "Wyatt"];
const lastNames = ["Foster", "Martinez", "Patel", "Thompson", "Brown", "Wilson", "Chen", "Sharma", "Davis", "White", "Scott", "Adams", "King", "Reed", "Cruz", "Young", "Baker", "Lee", "Hall", "Wright", "Lopez", "Hill", "Scott", "Green", "Adams", "Campbell", "Stewart", "Morris", "Rogers", "Reed", "Cook", "Morgan", "Bell", "Murphy", "Bailey", "Rivera", "Cooper", "Richardson", "Cox", "Howard", "Ward", "Torres", "Peterson", "Gray", "Ramirez", "James", "Watson", "Brooks", "Kelly", "Sanders"];
const roles = ["Frontend Dev", "UX Designer", "Product Manager", "Data Analyst", "DevOps Eng", "Visual Designer", "Backend Dev", "HR Manager", "Sales Lead", "Operations Mgr", "Marketing Specialist", "Software Engineer", "Account Manager", "QA Engineer", "UI Designer", "Systems Architect", "Legal Counsel", "IT Support", "Content Strategist", "Financial Analyst"];
const depts = ["Engineering", "Design", "Operations", "Engineering", "Engineering", "Design", "Engineering", "HR", "Sales", "Operations", "Sales", "Engineering", "Sales", "Engineering", "Design", "Engineering", "HR", "Operations", "Design", "Operations"];
const managers = ["Priya Sharma", "Emma Davis", "Alex Morrison", "James Wilson", "Sarah Wilson"];
const colors = ["#4299E1", "#9F7AEA", "#4CAA17", "#ECC94B", "#FC8181", "#F687B3", "#F6AD55", "#48BB78", "#ED64A6", "#2B6CB0", "#805AD5", "#38B2AC", "#D69E2E"];

const allEmployees = Array.from({ length: 50 }, (_, i) => {
  const id = i + 1;
  const firstName = firstNames[i % firstNames.length];
  const lastName = lastNames[i % lastNames.length];
  const name = `${firstName} ${lastName}`;
  const role = roles[i % roles.length];
  const dept = depts[i % depts.length];
  const color = colors[i % colors.length];
  const initials = (firstName[0] + lastName[0]).toUpperCase();
  const email = `${firstName.toLowerCase()}@tesco.com`;
  const manager = managers[i % managers.length];
  const employeeId = `EMP-${1000 + id}`;
  const status = i % 15 === 0 ? "On Leave" : "Active";

  return { id, name, role, dept, status, initials, color, email, manager, employeeId };
});

console.log(JSON.stringify(allEmployees, null, 2));
