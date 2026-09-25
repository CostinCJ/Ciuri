import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Reguli — Ciuri',
  description: 'Regulile jocului Ciuri: pachetul, licitația, contractele, jocul normal și punctajul.',
};

const SECTIONS = [
  { id: 'pachet', title: 'Pachetul' },
  { id: 'echipe', title: 'Jucători și echipe' },
  { id: 'runda', title: 'Desfășurarea rundei' },
  { id: 'licitatie', title: 'Licitația' },
  { id: 'pus-carti', title: 'Cum se pun cărțile' },
  { id: 'strigare', title: 'Strigarea' },
  { id: 'ciuri', title: 'Ciuri' },
  { id: 'adunare', title: 'Adunare' },
  { id: 'mare-mica', title: 'Mare și Mica' },
  { id: 'tromful-tau', title: 'Tromful tău' },
  { id: 'jocul-normal', title: 'Jocul normal și Stop' },
  { id: 'meciul', title: 'Meciul' },
  { id: 'timp', title: 'Timp limită' },
];

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-4 flex flex-col gap-3">
      <h2 className="text-2xl font-bold text-amber-400">{title}</h2>
      {children}
    </section>
  );
}

function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-stone-600 text-stone-300">
            {head.map((cell) => (
              <th key={cell} className="px-2 py-1.5 font-semibold">{cell}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-stone-800">
              {row.map((cell, j) => (
                <td key={j} className="px-2 py-1.5">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function List({ children }: { children: ReactNode }) {
  return <ul className="flex list-disc flex-col gap-1.5 pl-5">{children}</ul>;
}

export default function RulesPage() {
  return (
    <main className="felt flex min-h-dvh justify-center p-4">
      <article className="flex w-full max-w-3xl flex-col gap-8 rounded-2xl bg-stone-900/90 p-6 leading-relaxed text-stone-100 shadow-2xl sm:p-8">
        <header className="flex flex-col gap-4">
          <Link
            href="/"
            className="inline-flex w-fit items-center gap-1 rounded-md bg-stone-800 px-3 py-1.5 text-sm font-semibold text-stone-100 hover:bg-stone-700"
          >
            <span aria-hidden="true">←</span> Acasă
          </Link>
          <h1 className="text-4xl font-bold tracking-tight text-amber-400">Regulile jocului</h1>
          <p className="text-stone-300">
            Ciuri e un joc de cărți în echipe, cu pachet unguresc: 4 jucători, 2 echipe, până la 21 de puncte.
          </p>
          <nav aria-label="Cuprins" className="flex flex-wrap gap-2">
            {SECTIONS.map((s) => (
              <a key={s.id} href={`#${s.id}`} className="rounded-full bg-stone-800 px-3 py-1 text-xs text-stone-200 hover:bg-stone-700">
                {s.title}
              </a>
            ))}
          </nav>
        </header>

        <Section id="pachet" title="Pachetul">
          <p>Pachet unguresc de 20 de cărți (fără 7, 8, 9). Culori: roșu, verde, ghindă, dubă.</p>
          <Table
            head={['Carte', 'Nume', 'Valoare']}
            rows={[
              ['Alsó', 'Doiul', '2'],
              ['Felső', 'Treiul („omul”)', '3'],
              ['Király', 'Patrul („calul”)', '4'],
              ['X', 'Zece', '10'],
              ['Ász', 'As', '11'],
            ]}
          />
          <p className="text-sm text-stone-300">Ordinea de la mică la mare e cea din tabel. Total puncte în pachet: 120.</p>
        </Section>

        <Section id="echipe" title="Jucători și echipe">
          <List>
            <li>Exact 4 jucători. Coechipierii stau față în față.</li>
            <li>Se joacă în sensul acelor de ceasornic.</li>
            <li>Primul care împarte e ales la întâmplare, apoi se mută cu un loc la fiecare rundă.</li>
            <li><strong>Primul jucător</strong> e cel de după cel care împarte.</li>
          </List>
        </Section>

        <Section id="runda" title="Desfășurarea rundei">
          <ol className="flex list-decimal flex-col gap-1.5 pl-5">
            <li>Se amestecă și se împart <strong>3 cărți</strong> fiecăruia.</li>
            <li>Urmează licitația, în două etape: prima cu 3 cărți, a doua cu 5 cărți.</li>
            <li>Se joacă contractul licitat sau, dacă nu a licitat nimeni, jocul normal.</li>
          </ol>
        </Section>

        <Section id="licitatie" title="Licitația">
          <h3 className="text-lg font-semibold">Etapa 1 — cu primele 3 cărți</h3>
          <p>Fiecare jucător vorbește o singură dată, în ordine, începând cu primul jucător.</p>
          <Table
            head={['Contract', 'Cine îl poate zice', 'Valoare']}
            rows={[
              ['Ciuri', 'cine are Treiul + Patrul de aceeași culoare în primele 3 cărți', '12'],
              ['Adunare', 'oricine', '12'],
              ['Pas (Nimic)', 'oricine', '—'],
            ]}
          />
          <p>Licitația se termină imediat la primul Ciuri sau la prima Adunare; ceilalți nu mai vorbesc.</p>

          <h3 className="text-lg font-semibold">Între etape</h3>
          <p>
            Dacă toți 4 zic Pas, se mai împart <strong>2 cărți</strong> fiecăruia (câte 5). A 5-a carte a celui care
            împarte e <strong>cartea de tromf</strong>: se arată tuturor și rămâne în mâna lui.
          </p>

          <h3 className="text-lg font-semibold">Etapa 2 — cu 5 cărți</h3>
          <p>Vorbește doar primul jucător, după ce și-a văzut cele 5 cărți.</p>
          <Table
            head={['Contract', 'Valoare']}
            rows={[
              ['Tromful tău (alegi culoarea)', '6'],
              ['Mare', '6'],
              ['Mica', '4'],
              ['Pas (Nimic)', '—'],
            ]}
          />
          <p>Dacă zice Pas, urmează jocul normal, cu tromful dat de cartea arătată.</p>

          <h3 className="text-lg font-semibold">La orice contract</h3>
          <List>
            <li>Coechipierul celui care a licitat <strong>nu joacă</strong>; cărțile lui se pun deoparte.</li>
            <li>Contractul se joacă de cel care l-a licitat contra celor 2 adversari.</li>
            <li>La Ciuri, Tromful tău, Mare și Mica, cel care a licitat deschide prima mână.</li>
          </List>
        </Section>

        <Section id="pus-carti" title="Cum se pun cărțile">
          <p className="text-sm text-stone-300">Se aplică în jocul normal, la Ciuri și la Tromful tău.</p>
          <ol className="flex list-decimal flex-col gap-1.5 pl-5">
            <li>Ești obligat să răspunzi la culoarea cerută.</li>
            <li>
              Ești obligat să iei mâna dacă poți. Dacă mâna e deja tăiată cu tromf și ai doar culoarea cerută, pui orice
              carte din culoarea cerută.
            </li>
            <li>Dacă nu ai culoarea cerută, ești obligat să tai cu tromf. Dacă pe masă e deja tromf, trebuie să-l bați dacă poți.</li>
            <li>Dacă nu ai nici culoarea cerută, nici tromf, pui orice carte.</li>
            <li>Mâna o ia cel mai mare tromf; dacă nu s-a pus tromf, cea mai mare carte din culoarea cerută.</li>
            <li>Cine ia mâna deschide următoarea.</li>
          </ol>
        </Section>

        <Section id="strigare" title="Strigarea">
          <List>
            <li>Treiul + Patrul de aceeași culoare în mână formează o <strong>strigare</strong>.</li>
            <li>Se strigă doar când <strong>deschizi</strong> o mână cu Treiul sau cu Patrul, având și perechea în mână.</li>
            <li>Primești imediat <strong>20</strong> de puncte, sau <strong>40</strong> dacă e culoarea tromfului.</li>
            <li>Din mână iese doar cartea pusă; perechea rămâne. O pereche se strigă o singură dată.</li>
            <li>Strigarea e opțională (la Ciuri e automată).</li>
            <li>Nu există strigări la Mare, Mica și Adunare.</li>
          </List>
        </Section>

        <Section id="ciuri" title="Ciuri — 12 puncte">
          <List>
            <li>Se licitează doar cu Treiul + Patrul de aceeași culoare în primele 3 cărți.</li>
            <li><strong>Tromful e culoarea strigării.</strong> Se joacă cu câte 3 cărți, adică 3 mâini.</li>
            <li>
              Prima carte: dacă a treia carte e de tromf, poți deschide cu oricare; altfel ești obligat să deschizi cu
              Treiul sau cu Patrul.
            </li>
            <li>Strigarea de 40 se primește când se pune primul dintre Treiul și Patrul.</li>
            <li>
              <strong>Succes:</strong> cel puțin 66 de puncte (40 + mâinile luate) → echipa ta primește 12. Altfel, echipa
              adversă primește 12.
            </li>
          </List>
        </Section>

        <Section id="adunare" title="Adunare — 12 puncte">
          <List>
            <li>Nu se joacă nicio mână. Cel care a licitat și cei 2 adversari își arată cele 3 cărți.</li>
            <li>Se adună valorile celor 9 cărți (fără tromf, fără strigări).</li>
            <li><strong>66 sau mai mult</strong> → echipa celui care a licitat primește 12. Altfel, echipa adversă primește 12.</li>
          </List>
        </Section>

        <Section id="mare-mica" title="Mare (6) și Mica (4)">
          <List>
            <li>Doar primul jucător le poate licita, în etapa a 2-a.</li>
            <li>Se joacă cu câte 5 cărți, <strong>fără tromf</strong>. Cel care a licitat deschide fiecare mână.</li>
            <li>Adversarii trebuie să răspundă la culoare, dar nu sunt obligați să ia mâna. Fără culoare, pun orice.</li>
            <li><strong>Mare:</strong> dacă un adversar pune o carte mai mare din culoarea cerută → eșec.</li>
            <li><strong>Mica:</strong> dacă un adversar pune o carte mai mică din culoarea cerută → eșec.</li>
            <li>
              După 5 mâini fără eșec, echipa ta primește 6 (Mare) sau 4 (Mica). La eșec runda se oprește imediat și
              punctele merg la echipa adversă.
            </li>
          </List>
        </Section>

        <Section id="tromful-tau" title="Tromful tău — 6 puncte">
          <List>
            <li>Doar primul jucător îl poate licita, în etapa a 2-a, și își alege culoarea tromfului.</li>
            <li>Se joacă cu câte 5 cărți, după regulile obișnuite, cu strigări. Deschide cel care a licitat.</li>
            <li>
              <strong>Succes:</strong> cel puțin 66 de puncte (mâini luate + strigări) → echipa ta primește 6. Altfel, echipa
              adversă primește 6.
            </li>
          </List>
        </Section>

        <Section id="jocul-normal" title="Jocul normal și Stop">
          <List>
            <li>Toți au câte 5 cărți. Tromful e cartea arătată (a 5-a carte a celui care împarte).</li>
            <li>
              <strong>Se împarte din nou</strong> dacă niciunul dintre cei doi adversari ai celui care împarte nu are vreo
              carte de tromf. Scorul nu se schimbă, iar licitația reîncepe.
            </li>
            <li>Se joacă echipă contra echipă, cu strigări. Deschide primul jucător.</li>
            <li><strong>Echipa care ia ultima mână câștigă runda:</strong></li>
          </List>
          <Table
            head={['Adversarii au strâns', 'Puncte']}
            rows={[
              ['nicio mână', '3'],
              ['cel puțin o mână, dar sub 33 de puncte', '2'],
              ['33 de puncte sau mai mult', '1'],
            ]}
          />
          <h3 className="text-lg font-semibold">Stop</h3>
          <List>
            <li>Se poate zice <strong>oricând, de oricine</strong>, chiar dacă nu e rândul lui.</li>
            <li>
              Dacă echipa ta are cel puțin 66 de puncte (mâini luate + strigări) → primește 3. Altfel, echipa adversă
              primește 3. Runda se termină imediat.
            </li>
            <li>La contracte nu există Stop.</li>
          </List>
        </Section>

        <Section id="meciul" title="Meciul">
          <p>
            Se joacă până la <strong>21 de puncte</strong>. Prima echipă care ajunge la 21 câștigă. „Încă un meci”
            pornește un meci nou cu aceleași locuri.
          </p>
        </Section>

        <Section id="timp" title="Timp limită">
          <Table
            head={['Situație', 'Timp', 'Când expiră']}
            rows={[
              ['Licitație', '20 s', 'se consideră Pas'],
              ['Pusul unei cărți', '30 s', 'se pune automat cea mai mică carte permisă, fără strigare'],
            ]}
          />
        </Section>

        <Link
          href="/"
          className="self-center rounded-md bg-amber-500 px-6 py-3 text-lg font-semibold text-stone-900 hover:bg-amber-400"
        >
          Înapoi la joc
        </Link>
      </article>
    </main>
  );
}
