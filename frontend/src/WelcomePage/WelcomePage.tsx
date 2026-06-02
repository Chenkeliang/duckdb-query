import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Database,
  Sparkles,
  Stethoscope,
  Lock,
  Play,
  Github,
  Send,
  Check,
  ArrowRight,
} from 'lucide-react';

interface WelcomePageProps {
  onStartUsing: () => void;
}

const GH = 'https://github.com/Chenkeliang/duckdb-query';

/**
 * DuckQuery 着陆页 —— 深炭底 + DuckDB 暖金,单一强调色,非对称布局。
 * 在主题树之外渲染,故配色用显式 hex(JIT 安全的字面量类)。
 */
const WelcomePage: React.FC<WelcomePageProps> = ({ onStartUsing }) => {
  const { t } = useTranslation('common');
  const COMPARE_ROWS: [string, string, string, string][] = [
    [t('welcome.cmp.row1Label'), t('welcome.cmp.row1A'), t('welcome.cmp.row1B'), t('welcome.cmp.row1C')],
    [t('welcome.cmp.row2Label'), t('welcome.cmp.row2A'), t('welcome.cmp.row2B'), t('welcome.cmp.row2C')],
    [t('welcome.cmp.row3Label'), t('welcome.cmp.row3A'), t('welcome.cmp.row3B'), t('welcome.cmp.row3C')],
    [t('welcome.cmp.row4Label'), t('welcome.cmp.row4A'), t('welcome.cmp.row4B'), t('welcome.cmp.row4C')],
    [t('welcome.cmp.row5Label'), t('welcome.cmp.row5A'), t('welcome.cmp.row5B'), t('welcome.cmp.row5C')],
    [t('welcome.cmp.row6Label'), t('welcome.cmp.row6A'), t('welcome.cmp.row6B'), t('welcome.cmp.row6C')],
  ];
  return (
    <div className="min-h-screen bg-[#0E0F11] font-sans text-white antialiased">
      <style>{`
        @keyframes wpBlink{0%,49%{opacity:1}50%,100%{opacity:0}}
        .wp-caret{animation:wpBlink 1.05s steps(1) infinite}
        @keyframes wpFloaty{0%,100%{transform:translateY(0)}50%{transform:translateY(-7px)}}
        .wp-floaty{animation:wpFloaty 7s ease-in-out infinite}
        @keyframes wpGrow{from{transform:scaleY(.15)}to{transform:scaleY(1)}}
        .wp-bar{transform-origin:bottom;animation:wpGrow 1.1s cubic-bezier(.16,1,.3,1) both}
        @keyframes wpMarquee{from{transform:translateX(0)}to{transform:translateX(-50%)}}
        .wp-marquee{animation:wpMarquee 26s linear infinite}
        .wp-lift{transition:transform .35s cubic-bezier(.16,1,.3,1),border-color .35s,background-color .35s}
        .wp-lift:hover{transform:translateY(-3px)}
        .wp-btn{transition:transform .2s,background-color .2s}
        .wp-btn:active{transform:translateY(1px) scale(.985)}
      `}</style>

      {/* NAV */}
      <header className="sticky top-0 z-40 border-b border-white/[0.07] bg-[#0E0F11]/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-[1180px] items-center gap-7 px-6">
          <a href="#top" className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-[#F4B43C] text-sm font-bold text-[#0E0F11]">D</span>
            DuckQuery
          </a>
          <nav className="hidden items-center gap-6 text-[14px] text-white/55 md:flex">
            <a href="#features" className="transition hover:text-white">{t('welcome.navFeatures')}</a>
            <a href="#ai" className="transition hover:text-white">{t('welcome.navAI')}</a>
            <a href="#compare" className="transition hover:text-white">{t('welcome.navCompare')}</a>
            <a href="#start" className="transition hover:text-white">{t('welcome.navDeploy')}</a>
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <a href={GH} target="_blank" rel="noreferrer" className="hidden items-center gap-1.5 font-mono text-[13px] text-white/55 transition hover:text-white sm:inline-flex">
              <Github className="h-4 w-4" /> Star
            </a>
            <button onClick={onStartUsing} className="wp-btn rounded-lg bg-[#F4B43C] px-4 py-1.5 text-[14px] font-semibold text-[#0E0F11] hover:bg-[#FFD37A]">{t('welcome.start')}</button>
          </div>
        </div>
      </header>

      {/* HERO */}
      <section id="top" className="relative overflow-hidden">
        <div className="pointer-events-none absolute -right-40 -top-44 h-144 w-xl rounded-full bg-[#F4B43C]/10 blur-[130px]" />
        <div className="relative mx-auto grid max-w-[1180px] items-center gap-12 px-6 pb-24 pt-20 lg:grid-cols-[1.05fr_.95fr] lg:gap-10">
          <div className="max-w-xl">
            <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/3 px-3 py-1 font-mono text-[12px] text-white/55">
              <span className="h-1.5 w-1.5 rounded-full bg-[#F4B43C]" /> {t('welcome.heroEyebrow')}
            </div>
            <h1 className="text-[2.7rem] font-semibold leading-[1.04] tracking-tight md:text-[3.5rem]">
              {t('welcome.heroLine1')}<br /><span className="text-[#F4B43C]">{t('welcome.heroAccent')}</span>{t('welcome.heroLine2')}
            </h1>
            <p className="mt-6 max-w-md text-[1.06rem] leading-relaxed text-white/55">
              {t('welcome.heroParagraph')}
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <button onClick={onStartUsing} className="wp-btn rounded-xl bg-[#F4B43C] px-6 py-3 font-semibold text-[#0E0F11] hover:bg-[#FFD37A]">{t('welcome.start')}</button>
              <a href={GH} target="_blank" rel="noreferrer" className="wp-btn inline-flex items-center gap-2 rounded-xl border border-white/10 px-6 py-3 font-medium text-white/85 hover:bg-white/5">
                <Github className="h-4 w-4" /> {t('welcome.viewSource')}
              </a>
            </div>
            <div className="mt-10 flex flex-wrap gap-x-5 gap-y-2 font-mono text-[12px] text-white/30">
              {['CSV', 'Excel', 'Parquet', 'JSON', 'MySQL', 'PostgreSQL'].map((s, i) => (
                <React.Fragment key={s}>
                  {i > 0 && <i className="not-italic text-white/15">/</i>}
                  <span>{s}</span>
                </React.Fragment>
              ))}
            </div>
          </div>

          {/* live terminal */}
          <div className="wp-floaty">
            <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#16181C] shadow-[0_40px_90px_-40px_rgba(0,0,0,.85)]">
              <div className="flex h-10 items-center gap-2 border-b border-white/[0.07] bg-white/2 px-4">
                <span className="h-2.5 w-2.5 rounded-full bg-white/15" /><span className="h-2.5 w-2.5 rounded-full bg-white/15" /><span className="h-2.5 w-2.5 rounded-full bg-white/15" />
                <span className="ml-2 font-mono text-[11px] text-white/35">cross-source.sql</span>
                <span className="ml-auto rounded border border-[#F4B43C]/25 px-1.5 py-0.5 font-mono text-[10px] text-[#F4B43C]">DuckDB-Wasm</span>
              </div>
              <pre className="overflow-x-auto px-5 py-4 font-mono text-[12.5px] leading-6 text-white/80"><span className="text-[#F4B43C]">SELECT</span> u.name, <span className="text-[#F4B43C]">sum</span>(o.amount) <span className="text-[#F4B43C]">AS</span> total{'\n'}<span className="text-[#F4B43C]">FROM</span>   <span className="text-sky-300/80">orders</span> o                <span className="text-white/25">{'-- local file'}</span>{'\n'}<span className="text-[#F4B43C]">JOIN</span>   <span className="text-sky-300/80">mysql_db.users</span> u <span className="text-[#F4B43C]">USING</span>(user_id) <span className="text-white/25">{'-- remote'}</span>{'\n'}<span className="text-[#F4B43C]">GROUP BY</span> 1 <span className="text-[#F4B43C]">ORDER BY</span> total <span className="text-[#F4B43C]">DESC</span><span className="wp-caret text-[#F4B43C]">▌</span></pre>
              <div className="border-t border-white/[0.07] px-5 py-3.5">
                <div className="grid grid-cols-[1fr_auto] gap-px overflow-hidden rounded-lg bg-white/10 font-mono text-[12px]">
                  <div className="bg-[#1E2125] px-3 py-1.5 text-white/40">name</div><div className="bg-[#1E2125] px-3 py-1.5 text-right text-white/40">total</div>
                  {[['Lena Okwuosa', '47,210'], ['Mateo Rossi', '31,884'], ['Priya Nair', '22,640'], ['Tomás Bauer', '18,902']].map(([n, t]) => (
                    <React.Fragment key={n}>
                      <div className="bg-[#16181C] px-3 py-1.5">{n}</div><div className="bg-[#16181C] px-3 py-1.5 text-right text-[#F4B43C]">{t}</div>
                    </React.Fragment>
                  ))}
                </div>
                <div className="mt-2 flex items-center gap-2 font-mono text-[11px] text-white/45">
                  <Check className="h-3.5 w-3.5 text-[#F4B43C]" /> {t('welcome.terminalFooter')}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* tech marquee */}
        <div className="overflow-hidden border-y border-white/[0.07] bg-[#16181C]/40">
          <div className="wp-marquee flex w-max gap-12 whitespace-nowrap py-3.5 font-mono text-[12px] text-white/25">
            {[0, 1].map((k) => (
              <React.Fragment key={k}>
                {[t('welcome.marqueeBuiltOn'), 'ATTACH MySQL', 'ATTACH PostgreSQL', 'read_csv_auto', 'read_parquet', t('welcome.marqueeNoEtl'), t('welcome.marqueeLocalFirst'), 'MIT'].map((s) => <span key={s + k}>{s}</span>)}
              </React.Fragment>
            ))}
          </div>
        </div>
      </section>

      {/* FEATURE BENTO */}
      <section id="features" className="mx-auto max-w-[1180px] px-6 py-24">
        <div className="mb-12 max-w-xl">
          <div className="mb-3 font-mono text-[12px] uppercase tracking-widest text-[#F4B43C]">{t('welcome.featuresEyebrow')}</div>
          <h2 className="text-[2rem] font-semibold leading-tight tracking-tight md:text-[2.6rem]">{t('welcome.featuresHeading')}</h2>
        </div>
        <div className="grid auto-rows-[150px] gap-4 md:grid-cols-3">
          <div className="wp-lift flex flex-col justify-between rounded-3xl border border-white/10 bg-[#16181C] p-7 hover:border-[#F4B43C]/40 md:col-span-2 md:row-span-2">
            <div className="flex items-center gap-2 font-mono text-[12px] text-white/45"><Database className="h-4 w-4" strokeWidth={1.5} /> {t('welcome.joinLabel')}</div>
            <div>
              <div className="mb-5 rounded-xl border border-white/[0.07] bg-[#0E0F11]/60 px-4 py-3 font-mono text-[12.5px] leading-6 text-white/70">
                <span className="text-[#F4B43C]">FROM</span> <span className="text-sky-300/80">orders.parquet</span> <span className="text-[#F4B43C]">JOIN</span> <span className="text-sky-300/80">mysql.users</span><br /><span className="text-white/30">{t('welcome.joinCodeNote')}</span>
              </div>
              <div className="text-2xl font-semibold tracking-tight">{t('welcome.joinTitle')}</div>
              <p className="mt-1 max-w-sm text-[14px] text-white/45">{t('welcome.joinDesc')}</p>
            </div>
          </div>

          <BentoTile icon={<Sparkles className="h-5 w-5 text-[#F4B43C]" strokeWidth={1.5} />} title={t('welcome.askTitle')} desc={t('welcome.askDesc')} />
          <BentoTile icon={<Stethoscope className="h-5 w-5 text-[#F4B43C]" strokeWidth={1.5} />} title={t('welcome.doctorTitle')} desc={t('welcome.doctorDesc')} />

          <div className="wp-lift flex flex-col justify-between rounded-3xl border border-white/10 bg-[#16181C] p-6 hover:border-[#F4B43C]/40">
            <div className="flex h-12 items-end gap-1.5">
              <span className="wp-bar w-3 rounded-sm bg-[#F4B43C]/40" style={{ height: '40%' }} />
              <span className="wp-bar w-3 rounded-sm bg-[#F4B43C]/60" style={{ height: '70%', animationDelay: '.1s' }} />
              <span className="wp-bar w-3 rounded-sm bg-[#F4B43C]" style={{ height: '100%', animationDelay: '.2s' }} />
              <span className="wp-bar w-3 rounded-sm bg-[#F4B43C]/50" style={{ height: '55%', animationDelay: '.3s' }} />
            </div>
            <div><div className="font-semibold">{t('welcome.chartTitle')}</div><p className="mt-1 text-[13px] text-white/45">{t('welcome.chartDesc')}</p></div>
          </div>

          <BentoTile icon={<Lock className="h-5 w-5 text-[#F4B43C]" strokeWidth={1.5} />} title={t('welcome.localTitle')} desc={t('welcome.localDesc')} />

          <div className="wp-lift flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-white/10 bg-linear-to-r from-[#16181C] to-[#16181C]/30 p-6 hover:border-[#F4B43C]/40 md:col-span-3">
            <div className="flex items-center gap-3">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#F4B43C]/15 text-[#F4B43C]"><Play className="h-[18px] w-[18px]" /></span>
              <div><div className="font-semibold">{t('welcome.demoTitle')}</div><div className="text-[13px] text-white/45">{t('welcome.demoDesc')}</div></div>
            </div>
            <button onClick={onStartUsing} className="wp-btn rounded-xl bg-[#F4B43C] px-5 py-2.5 font-semibold text-[#0E0F11] hover:bg-[#FFD37A]">{t('welcome.demoCta')}</button>
          </div>
        </div>
      </section>

      {/* AI SPOTLIGHT */}
      <section id="ai" className="border-y border-white/[0.07] bg-[#16181C]/30">
        <div className="mx-auto grid max-w-[1180px] items-center gap-12 px-6 py-24 lg:grid-cols-2">
          <div>
            <div className="mb-3 font-mono text-[12px] uppercase tracking-widest text-[#F4B43C]">{t('welcome.aiEyebrow')}</div>
            <h2 className="text-[2rem] font-semibold leading-tight tracking-tight md:text-[2.6rem]">{t('welcome.aiHeadingLine1')}<br />{t('welcome.aiHeadingLine2')}</h2>
            <p className="mt-5 max-w-md leading-relaxed text-white/55">{t('welcome.aiParagraph')}</p>
            <ul className="mt-7 space-y-3 text-[14.5px]">
              {[t('welcome.aiCheck1'), t('welcome.aiCheck2'), t('welcome.aiCheck3')].map((s) => (
                <li key={s} className="flex gap-3"><Check className="mt-1 h-4 w-4 shrink-0 text-[#F4B43C]" strokeWidth={2.2} /> {s}</li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#16181C] p-4 shadow-[0_40px_90px_-50px_rgba(0,0,0,.9)]">
            <div className="mb-3 flex justify-end">
              <div className="max-w-[78%] rounded-2xl rounded-tr-sm bg-[#F4B43C] px-4 py-2.5 text-[14px] font-medium text-[#0E0F11]">{t('welcome.aiUserBubble')}</div>
            </div>
            <div className="flex gap-2.5">
              <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#F4B43C]/15 text-[#F4B43C]"><Sparkles className="h-3.5 w-3.5" /></span>
              <div className="max-w-[82%] rounded-2xl rounded-tl-sm bg-[#1E2125] px-4 py-3 text-[14px] text-white/85">
                {t('welcome.aiAssistant')}
                <div className="mt-2.5 overflow-hidden rounded-lg border border-white/10 bg-[#0E0F11]/70 font-mono text-[12px] leading-6 text-white/80">
                  <pre className="overflow-x-auto px-3 py-2.5"><span className="text-[#F4B43C]">SELECT</span> city, <span className="text-[#F4B43C]">sum</span>(amount) total{'\n'}<span className="text-[#F4B43C]">FROM</span> sales{'\n'}<span className="text-[#F4B43C]">WHERE</span> created_at &gt;= <span className="text-emerald-300/80">{"'2026-05-01'"}</span>{'\n'}<span className="text-[#F4B43C]">GROUP BY</span> 1 <span className="text-[#F4B43C]">ORDER BY</span> total <span className="text-[#F4B43C]">DESC</span></pre>
                  <div className="flex justify-end border-t border-white/10 px-3 py-1.5"><button className="wp-btn text-[12px] text-[#F4B43C] hover:underline">{t('welcome.aiInsert')}</button></div>
                </div>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2 rounded-xl border border-white/10 bg-[#0E0F11]/60 px-3 py-2">
              <input disabled placeholder={t('welcome.aiInputPlaceholder')} className="flex-1 bg-transparent text-[13px] text-white/40 outline-hidden placeholder:text-white/25" />
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-[#F4B43C] text-[#0E0F11]"><Send className="h-3.5 w-3.5" /></span>
            </div>
          </div>
        </div>
      </section>

      {/* COMPARISON */}
      <section id="compare" className="mx-auto max-w-[1180px] px-6 py-24">
        <div className="mb-10 max-w-xl">
          <div className="mb-3 font-mono text-[12px] uppercase tracking-widest text-[#F4B43C]">{t('welcome.cmpEyebrow')}</div>
          <h2 className="text-[2rem] font-semibold leading-tight tracking-tight md:text-[2.6rem]">{t('welcome.cmpHeading')}</h2>
          <p className="mt-4 max-w-lg text-white/55">{t('welcome.cmpParagraph')}</p>
        </div>
        <div className="overflow-x-auto rounded-2xl border border-white/10">
          <table className="w-full border-collapse text-[14px]">
            <thead>
              <tr className="bg-[#16181C]/60 text-left font-mono text-[12px] text-white/45">
                <th className="px-5 py-3 font-medium" />
                <th className="px-5 py-3 font-semibold text-[#F4B43C]">DuckQuery</th>
                <th className="whitespace-nowrap px-5 py-3 font-medium">DBeaver / TablePlus</th>
                <th className="whitespace-nowrap px-5 py-3 font-medium">Metabase / Superset</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.07]">
              {COMPARE_ROWS.map(([label, a, b, c]) => (
                <tr key={label}>
                  <td className="whitespace-nowrap px-5 py-3.5 text-white/55">{label}</td>
                  <td className="px-5 py-3.5"><span className="font-medium text-[#F4B43C]">{a}</span></td>
                  <td className="px-5 py-3.5 text-white/45">{b}</td>
                  <td className="px-5 py-3.5 text-white/35">{c}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 font-mono text-[12px] text-white/30">{t('welcome.cmpFootnote')}</p>
      </section>

      {/* QUICKSTART */}
      <section id="start" className="border-y border-white/[0.07] bg-[#16181C]/30">
        <div className="mx-auto grid max-w-[1180px] items-center gap-12 px-6 py-24 lg:grid-cols-[1fr_1.1fr]">
          <div>
            <div className="mb-3 font-mono text-[12px] uppercase tracking-widest text-[#F4B43C]">{t('welcome.startEyebrow')}</div>
            <h2 className="text-[2rem] font-semibold leading-tight tracking-tight md:text-[2.6rem]">{t('welcome.startHeading')}</h2>
            <p className="mt-5 max-w-md leading-relaxed text-white/55">{t('welcome.startParagraph')}</p>
            <div className="mt-7 flex flex-wrap gap-3">
              <button onClick={onStartUsing} className="wp-btn rounded-xl bg-[#F4B43C] px-6 py-3 font-semibold text-[#0E0F11] hover:bg-[#FFD37A]">{t('welcome.start')}</button>
              <a href={GH} target="_blank" rel="noreferrer" className="wp-btn inline-flex items-center gap-2 rounded-xl border border-white/10 px-6 py-3 font-medium text-white/85 hover:bg-white/5"><Github className="h-4 w-4" /> GitHub</a>
            </div>
          </div>
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#16181C] shadow-[0_40px_90px_-50px_rgba(0,0,0,.9)]">
            <div className="flex h-10 items-center gap-2 border-b border-white/[0.07] bg-white/2 px-4 font-mono text-[11px] text-white/35">
              <span className="h-2.5 w-2.5 rounded-full bg-white/15" /><span className="h-2.5 w-2.5 rounded-full bg-white/15" /><span className="h-2.5 w-2.5 rounded-full bg-white/15" /><span className="ml-2">terminal</span>
            </div>
            <pre className="overflow-x-auto px-5 py-5 font-mono text-[12.5px] leading-7 text-white/80"><span className="text-white/30">$</span> git clone https://github.com/Chenkeliang/duckdb-query.git{'\n'}<span className="text-white/30">$</span> cd duckdb-query && ./quick-start.sh{'\n'}<span className="text-[#F4B43C]">→ http://localhost:3000</span>  <span className="text-white/30">{t('welcome.terminalReady')}<span className="wp-caret">▌</span></span></pre>
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute left-1/2 -top-32 h-96 w-96 -translate-x-1/2 rounded-full bg-[#F4B43C]/10 blur-[120px]" />
        <div className="relative mx-auto max-w-[1180px] px-6 py-28 text-center">
          <h2 className="mx-auto max-w-2xl text-[2.4rem] font-semibold leading-[1.05] tracking-tight md:text-[3.2rem]">{t('welcome.ctaHeadingLine1')}<span className="text-[#F4B43C]">{t('welcome.ctaHeadingAccent')}</span></h2>
          <p className="mx-auto mt-5 max-w-2xl text-white/55 md:whitespace-nowrap">{t('welcome.ctaParagraph')}</p>
          <div className="mt-9 flex flex-wrap justify-center gap-3">
            <button onClick={onStartUsing} className="wp-btn rounded-xl bg-[#F4B43C] px-7 py-3.5 font-semibold text-[#0E0F11] hover:bg-[#FFD37A]">{t('welcome.start')}</button>
            <a href={GH} target="_blank" rel="noreferrer" className="wp-btn inline-flex items-center gap-2 rounded-xl border border-white/10 px-7 py-3.5 font-medium text-white/85 hover:bg-white/5">{t('welcome.ctaStar')} <ArrowRight className="h-4 w-4" /></a>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-white/[0.07]">
        <div className="mx-auto grid max-w-[1180px] gap-10 px-6 py-14 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <div className="mb-3 flex items-center gap-2 font-semibold tracking-tight">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-[#F4B43C] text-sm font-bold text-[#0E0F11]">D</span> DuckQuery
            </div>
            <p className="max-w-xs text-[13px] leading-relaxed text-white/45">{t('welcome.footerTagline')}</p>
          </div>
          <FooterCol title={t('welcome.footerProduct')} items={[[t('welcome.footerFeatures'), '#features'], [t('welcome.footerAI'), '#ai'], [t('welcome.footerCompare'), '#compare']]} />
          <FooterCol title={t('welcome.footerResources')} items={[[t('welcome.footerSelfHost'), '#start'], [t('welcome.footerDocs'), GH]]} />
          <FooterCol title={t('welcome.footerOpenSource')} items={[['GitHub', GH], ['MIT License', GH]]} />
        </div>
        <div className="border-t border-white/[0.07]">
          <div className="mx-auto flex max-w-[1180px] flex-wrap items-center justify-between gap-3 px-6 py-5 font-mono text-[12px] text-white/30">
            <span>{t('welcome.footerCopyright')}</span>
            <span>{t('welcome.footerBuilt')}</span>
          </div>
        </div>
      </footer>
    </div>
  );
};

const BentoTile: React.FC<{ icon: React.ReactNode; title: string; desc: string }> = ({ icon, title, desc }) => (
  <div className="wp-lift flex flex-col justify-between rounded-3xl border border-white/10 bg-[#16181C] p-6 hover:border-[#F4B43C]/40">
    {icon}
    <div><div className="font-semibold">{title}</div><p className="mt-1 text-[13px] text-white/45">{desc}</p></div>
  </div>
);

const FooterCol: React.FC<{ title: string; items: [string, string][] }> = ({ title, items }) => (
  <div className="text-[14px]">
    <div className="mb-3 font-mono text-[12px] text-white/35">{title}</div>
    <ul className="space-y-2 text-white/55">
      {items.map(([label, href]) => (
        <li key={label}><a href={href} target={href.startsWith('http') ? '_blank' : undefined} rel="noreferrer" className="transition hover:text-white">{label}</a></li>
      ))}
    </ul>
  </div>
);

export default WelcomePage;
