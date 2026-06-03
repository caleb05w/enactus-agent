import JSZip from 'jszip'
import Papa from 'papaparse'

function parseCSV(text) {
  const { data } = Papa.parse(text.trim(), { header: true, skipEmptyLines: true })
  return data
}

export async function parseLinkedInExport(buffer) {
  const zip = await JSZip.loadAsync(buffer)

  async function readFile(name) {
    const file = zip.file(name)
    if (!file) return null
    return file.async('string')
  }

  const [profileText, positionsText, educationText, skillsText] = await Promise.all([
    readFile('Profile.csv'),
    readFile('Positions.csv'),
    readFile('Education.csv'),
    readFile('Skills.csv'),
  ])

  const profile = profileText ? parseCSV(profileText)[0] ?? {} : {}
  const positions = positionsText ? parseCSV(positionsText) : []
  const education = educationText ? parseCSV(educationText) : []
  const skills = skillsText ? parseCSV(skillsText) : []

  const firstName = profile['First Name'] ?? ''
  const lastName = profile['Last Name'] ?? ''

  return {
    name: `${firstName} ${lastName}`.trim() || null,
    headline: profile['Headline'] ?? '',
    summary: profile['Summary'] ?? '',
    positions: positions.map((p) => ({
      title: p['Title'] ?? '',
      company: p['Company Name'] ?? '',
      description: p['Description'] ?? '',
      startDate: p['Started On'] ?? '',
      endDate: p['Finished On'] ?? '',
    })),
    education: education.map((e) => ({
      school: e['School Name'] ?? '',
      degree: e['Degree Name'] ?? '',
      field: e['Activities'] ?? '',
      startDate: e['Start Date'] ?? '',
      endDate: e['End Date'] ?? '',
    })),
    skills: skills.map((s) => s['Name']).filter(Boolean),
  }
}
