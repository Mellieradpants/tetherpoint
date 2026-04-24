import { useState } from "react";

const SAVE_ACT_SAMPLE_TEXT = `H. R. 22

AN ACT

To amend the National Voter Registration Act of 1993 to require proof of United States citizenship to register an individual to vote in elections for Federal office, and for other purposes.

Be it enacted by the Senate and House of Representatives of the United States of America in Congress assembled,

SECTION 1. Short title.

This Act may be cited as the “Safeguard American Voter Eligibility Act” or the “SAVE Act”.

SEC. 2. Ensuring only citizens are registered to vote in elections for Federal office.

(a) Definition of documentary proof of United States citizenship.—Section 3 of the National Voter Registration Act of 1993 (52 U.S.C. 20502) is amended—

(1) by striking “As used” and inserting “(a) In general.—As used”; and

(2) by adding at the end the following:

“(b) Documentary proof of United States citizenship.—As used in this Act, the term ‘documentary proof of United States citizenship’ means, with respect to an applicant for voter registration, any of the following:

“(1) A form of identification issued consistent with the requirements of the REAL ID Act of 2005 that indicates the applicant is a citizen of the United States.

“(2) A valid United States passport.

“(3) The applicant's official United States military identification card, together with a United States military record of service showing that the applicant's place of birth was in the United States.

“(4) A valid government-issued photo identification card issued by a Federal, State or Tribal government showing that the applicant’s place of birth was in the United States.

“(5) A valid government-issued photo identification card issued by a Federal, State or Tribal government other than an identification described in paragraphs (1) through (4), but only if presented together with one or more of the following:

“(A) A certified birth certificate issued by a State, a unit of local government in a State, or a Tribal government which—

“(i) was issued by the State, unit of local government, or Tribal government in which the applicant was born;

“(ii) was filed with the office responsible for keeping vital records in the State;

“(iii) includes the full name, date of birth, and place of birth of the applicant;

“(iv) lists the full names of one or both of the parents of the applicant;

“(v) has the signature of an individual who is authorized to sign birth certificates on behalf of the State, unit of local government, or Tribal government in which the applicant was born;

“(vi) includes the date that the certificate was filed with the office responsible for keeping vital records in the State; and

“(vii) has the seal of the State, unit of local government, or Tribal government that issued the birth certificate.

“(B) An extract from a United States hospital Record of Birth created at the time of the applicant's birth which indicates that the applicant’s place of birth was in the United States.

“(C) A final adoption decree showing the applicant’s name and that the applicant’s place of birth was in the United States.

“(D) A Consular Report of Birth Abroad of a citizen of the United States or a certification of the applicant’s Report of Birth of a United States citizen issued by the Secretary of State.

“(E) A Naturalization Certificate or Certificate of Citizenship issued by the Secretary of Homeland Security or any other document or method of proof of United States citizenship issued by the Federal government pursuant to the Immigration and Nationality Act.

“(F) An American Indian Card issued by the Department of Homeland Security with the classification ‘KIC’.”.

(b) In general.—Section 4 of the National Voter Registration Act of 1993 (52 U.S.C. 20503) is amended—

(1) in subsection (a), by striking “subsection (b)” and inserting “subsection (c)”;

(2) by redesignating subsection (b) as subsection (c); and

(3) by inserting after subsection (a) the following new subsection:

“(b) Requiring applicants to present documentary proof of United States citizenship.—Under any method of voter registration in a State, the State shall not accept and process an application to register to vote in an election for Federal office unless the applicant presents documentary proof of United States citizenship with the application.”.

(d) Requiring documentary proof of United States citizenship with national mail voter registration form.—Section 6 of the National Voter Registration Act of 1993 (52 U.S.C. 20505) is amended—

“(e) Ensuring proof of United States citizenship.—

“(1) PRESENTING PROOF OF UNITED STATES CITIZENSHIP TO ELECTION OFFICIAL.—An applicant who submits the mail voter registration application form prescribed by the Election Assistance Commission pursuant to section 9(a)(2) or a form described in paragraph (1) or (2) of subsection (a) shall not be registered to vote in an election for Federal office unless—

“(A) the applicant presents documentary proof of United States citizenship in person to the office of the appropriate election official not later than the deadline provided by State law for the receipt of a completed voter registration application for the election; or

“(B) in the case of a State which permits an individual to register to vote in an election for Federal office at a polling place on the day of the election and on any day when voting, including early voting, is permitted for the election, the applicant presents documentary proof of United States citizenship to the appropriate election official at the polling place not later than the date of the election.

“(2) NOTIFICATION OF REQUIREMENT.—Upon receiving an otherwise completed mail voter registration application form prescribed by the Election Assistance Commission pursuant to section 9(a)(2) or a form described in paragraph (1) or (2) of subsection (a), the appropriate election official shall transmit a notice to the applicant of the requirement to present documentary proof of United States citizenship under this subsection, and shall include in the notice instructions to enable the applicant to meet the requirement.`;

const CONTENT_TYPES = ["text", "html", "xml", "json"] as const;

interface AnalyzeFormProps {
  onSubmit: (content: string, contentType: string, options: Record<string, boolean>) => void;
  loading: boolean;
}

export function AnalyzeForm({ onSubmit, loading }: AnalyzeFormProps) {
  const [content, setContent] = useState("");
  const [contentType, setContentType] = useState<string>("text");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(content, contentType, {
      run_meaning: true,
      run_origin: true,
      run_verification: true,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Type</span>
        <div className="flex gap-0.5 rounded-md bg-surface p-0.5">
          {CONTENT_TYPES.map((ct) => (
            <button
              key={ct}
              type="button"
              onClick={() => setContentType(ct)}
              className={`rounded px-3 py-1 text-[11px] font-mono transition-colors ${
                contentType === ct
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {ct}
            </button>
          ))}
        </div>
      </div>

      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Paste document content here…"
        className="w-full rounded-md border border-border bg-surface p-3 font-mono text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring resize-y"
        rows={6}
      />


      <div className="flex gap-2">
        <button
          type="submit"
          disabled={loading || !content.trim()}
          className="rounded-md bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
        >
          {loading ? "Analyzing…" : "Analyze"}
        </button>
        <button
          type="button"
          onClick={() => { setContent(SAVE_ACT_SAMPLE_TEXT); setContentType("text"); }}
          className="rounded-md bg-secondary px-4 py-2 text-xs font-medium text-secondary-foreground transition-colors hover:bg-accent"
        >
          Load Sample
        </button>
      </div>
    </form>
  );
}
