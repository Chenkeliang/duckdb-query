import React from 'react';
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

const COMPARE_ROWS: [string, string, string, string][] = [
  ['查本地 CSV / Excel / Parquet', '原生', '需先导入', '不支持'],
  ['一条 SQL JOIN 文件 ↔ MySQL/PG', '支持', '不支持', '不支持'],
  ['自然语言生成 SQL', '内置', '无', '付费 / 受限'],
  ['免 ETL / 免数仓', '是', '是', '否'],
  ['完全本地 / 自托管', '是', '是', '需服务端'],
  ['上手到第一条查询', '几秒', '几分钟', '几小时'],
];

/**
 * DuckQuery 着陆页 —— 深炭底 + DuckDB 暖金,单一强调色,非对称布局。
 * 在主题树之外渲染,故配色用显式 hex(JIT 安全的字面量类)。
 */
const WelcomePage: React.FC<WelcomePageProps> = ({ onStartUsing }) => {
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
            <a href="#features" className="transition hover:text-white">功能</a>
            <a href="#ai" className="transition hover:text-white">AI</a>
            <a href="#compare" className="transition hover:text-white">对比</a>
            <a href="#start" className="transition hover:text-white">部署</a>
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <a href={GH} target="_blank" rel="noreferrer" className="hidden items-center gap-1.5 font-mono text-[13px] text-white/55 transition hover:text-white sm:inline-flex">
              <Github className="h-4 w-4" /> Star
            </a>
            <button onClick={onStartUsing} className="wp-btn rounded-lg bg-[#F4B43C] px-4 py-1.5 text-[14px] font-semibold text-[#0E0F11] hover:bg-[#FFD37A]">开始使用</button>
          </div>
        </div>
      </header>

      {/* HERO */}
      <section id="top" className="relative overflow-hidden">
        <div className="pointer-events-none absolute -right-40 -top-44 h-[36rem] w-[36rem] rounded-full bg-[#F4B43C]/10 blur-[130px]" />
        <div className="relative mx-auto grid max-w-[1180px] items-center gap-12 px-6 pb-24 pt-20 lg:grid-cols-[1.05fr_.95fr] lg:gap-10">
          <div className="max-w-xl">
            <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 font-mono text-[12px] text-white/55">
              <span className="h-1.5 w-1.5 rounded-full bg-[#F4B43C]" /> Powered by DuckDB · 开源 MIT · 自托管
            </div>
            <h1 className="text-[2.7rem] font-semibold leading-[1.04] tracking-tight md:text-[3.5rem]">
              文件和数据库,<br /><span className="text-[#F4B43C]">一条 SQL</span> 查到底。
            </h1>
            <p className="mt-6 max-w-md text-[1.06rem] leading-relaxed text-white/55">
              把本地 CSV / Excel 和远程 MySQL / Postgres 摆在一起跨源 JOIN,用大白话生成 SQL,一键出图。不建仓、不写脚本,数据不出本机。
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <button onClick={onStartUsing} className="wp-btn rounded-xl bg-[#F4B43C] px-6 py-3 font-semibold text-[#0E0F11] hover:bg-[#FFD37A]">开始使用</button>
              <a href={GH} target="_blank" rel="noreferrer" className="wp-btn inline-flex items-center gap-2 rounded-xl border border-white/10 px-6 py-3 font-medium text-white/85 hover:bg-white/5">
                <Github className="h-4 w-4" /> 查看源码
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
              <div className="flex h-10 items-center gap-2 border-b border-white/[0.07] bg-white/[0.02] px-4">
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
                  <Check className="h-3.5 w-3.5 text-[#F4B43C]" /> 4 行 · 12 ms · 本地 ⋈ 远程
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
                {['建于 DuckDB', 'ATTACH MySQL', 'ATTACH PostgreSQL', 'read_csv_auto', 'read_parquet', '免 ETL', '本地优先', 'MIT'].map((s) => <span key={s + k}>{s}</span>)}
              </React.Fragment>
            ))}
          </div>
        </div>
      </section>

      {/* FEATURE BENTO */}
      <section id="features" className="mx-auto max-w-[1180px] px-6 py-24">
        <div className="mb-12 max-w-xl">
          <div className="mb-3 font-mono text-[12px] uppercase tracking-widest text-[#F4B43C]">能力</div>
          <h2 className="text-[2rem] font-semibold leading-tight tracking-tight md:text-[2.6rem]">一个工作台,打通你所有数据。</h2>
        </div>
        <div className="grid auto-rows-[150px] gap-4 md:grid-cols-3">
          <div className="wp-lift flex flex-col justify-between rounded-3xl border border-white/10 bg-[#16181C] p-7 hover:border-[#F4B43C]/40 md:col-span-2 md:row-span-2">
            <div className="flex items-center gap-2 font-mono text-[12px] text-white/45"><Database className="h-4 w-4" strokeWidth={1.5} /> 跨源 JOIN</div>
            <div>
              <div className="mb-5 rounded-xl border border-white/[0.07] bg-[#0E0F11]/60 px-4 py-3 font-mono text-[12.5px] leading-6 text-white/70">
                <span className="text-[#F4B43C]">FROM</span> <span className="text-sky-300/80">orders.parquet</span> <span className="text-[#F4B43C]">JOIN</span> <span className="text-sky-300/80">mysql.users</span><br /><span className="text-white/30">→ 本地文件 ⋈ 远程库,DuckDB ATTACH,一次查询</span>
              </div>
              <div className="text-2xl font-semibold tracking-tight">毫秒级跨数据源关联</div>
              <p className="mt-1 max-w-sm text-[14px] text-white/45">不导入、不搬运。CSV、Excel、MySQL、Postgres 在同一条 SQL 里直接 JOIN。</p>
            </div>
          </div>

          <BentoTile icon={<Sparkles className="h-5 w-5 text-[#F4B43C]" strokeWidth={1.5} />} title="问数 · Text-to-SQL" desc="说人话,AI 写 SQL,你审了再跑——绝不自动执行。" />
          <BentoTile icon={<Stethoscope className="h-5 w-5 text-[#F4B43C]" strokeWidth={1.5} />} title="报错医生" desc="查询出错,AI 读真实表结构,给中文诊断 + 修正 SQL。" />

          <div className="wp-lift flex flex-col justify-between rounded-3xl border border-white/10 bg-[#16181C] p-6 hover:border-[#F4B43C]/40">
            <div className="flex h-12 items-end gap-1.5">
              <span className="wp-bar w-3 rounded-sm bg-[#F4B43C]/40" style={{ height: '40%' }} />
              <span className="wp-bar w-3 rounded-sm bg-[#F4B43C]/60" style={{ height: '70%', animationDelay: '.1s' }} />
              <span className="wp-bar w-3 rounded-sm bg-[#F4B43C]" style={{ height: '100%', animationDelay: '.2s' }} />
              <span className="wp-bar w-3 rounded-sm bg-[#F4B43C]/50" style={{ height: '55%', animationDelay: '.3s' }} />
            </div>
            <div><div className="font-semibold">一键出图</div><p className="mt-1 text-[13px] text-white/45">结果转柱/线/饼/大数字,AI 还能帮你选图型。</p></div>
          </div>

          <BentoTile icon={<Lock className="h-5 w-5 text-[#F4B43C]" strokeWidth={1.5} />} title="本地优先 · 自托管" desc="Docker 一键起,数据全程在你机器上,Key 服务端加密。" />

          <div className="wp-lift flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-white/10 bg-gradient-to-r from-[#16181C] to-[#16181C]/30 p-6 hover:border-[#F4B43C]/40 md:col-span-3">
            <div className="flex items-center gap-3">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#F4B43C]/15 text-[#F4B43C]"><Play className="h-[18px] w-[18px]" /></span>
              <div><div className="font-semibold">浏览器内 Demo</div><div className="text-[13px] text-white/45">DuckDB-Wasm,免安装,拖个 CSV 立刻跑真 SQL。</div></div>
            </div>
            <button onClick={onStartUsing} className="wp-btn rounded-xl bg-[#F4B43C] px-5 py-2.5 font-semibold text-[#0E0F11] hover:bg-[#FFD37A]">进入工作台</button>
          </div>
        </div>
      </section>

      {/* AI SPOTLIGHT */}
      <section id="ai" className="border-y border-white/[0.07] bg-[#16181C]/30">
        <div className="mx-auto grid max-w-[1180px] items-center gap-12 px-6 py-24 lg:grid-cols-2">
          <div>
            <div className="mb-3 font-mono text-[12px] uppercase tracking-widest text-[#F4B43C]">AI · 自带模型 Key</div>
            <h2 className="text-[2rem] font-semibold leading-tight tracking-tight md:text-[2.6rem]">不会写 SQL?<br />用大白话问就行。</h2>
            <p className="mt-5 max-w-md leading-relaxed text-white/55">对话式问数据、生成与改写 SQL、解释复杂查询、出错时给修复建议。生成的 SQL 永远先给你看、你点了才执行。默认关闭,接你自己的模型。</p>
            <ul className="mt-7 space-y-3 text-[14.5px]">
              {['Text-to-SQL:一句话 → 可审阅的 SELECT', '报错医生:读真实表结构(含联邦表)给修复', '隐私:Key 服务端加密,生成 SQL 绝不自动跑'].map((s) => (
                <li key={s} className="flex gap-3"><Check className="mt-1 h-4 w-4 shrink-0 text-[#F4B43C]" strokeWidth={2.2} /> {s}</li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#16181C] p-4 shadow-[0_40px_90px_-50px_rgba(0,0,0,.9)]">
            <div className="mb-3 flex justify-end">
              <div className="max-w-[78%] rounded-2xl rounded-tr-sm bg-[#F4B43C] px-4 py-2.5 text-[14px] font-medium text-[#0E0F11]">上个月每个城市的销售额,从高到低</div>
            </div>
            <div className="flex gap-2.5">
              <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#F4B43C]/15 text-[#F4B43C]"><Sparkles className="h-3.5 w-3.5" /></span>
              <div className="max-w-[82%] rounded-2xl rounded-tl-sm bg-[#1E2125] px-4 py-3 text-[14px] text-white/85">
                帮你写好了,确认后再执行:
                <div className="mt-2.5 overflow-hidden rounded-lg border border-white/10 bg-[#0E0F11]/70 font-mono text-[12px] leading-6 text-white/80">
                  <pre className="overflow-x-auto px-3 py-2.5"><span className="text-[#F4B43C]">SELECT</span> city, <span className="text-[#F4B43C]">sum</span>(amount) total{'\n'}<span className="text-[#F4B43C]">FROM</span> sales{'\n'}<span className="text-[#F4B43C]">WHERE</span> created_at &gt;= <span className="text-emerald-300/80">{"'2026-05-01'"}</span>{'\n'}<span className="text-[#F4B43C]">GROUP BY</span> 1 <span className="text-[#F4B43C]">ORDER BY</span> total <span className="text-[#F4B43C]">DESC</span></pre>
                  <div className="flex justify-end border-t border-white/10 px-3 py-1.5"><button className="wp-btn text-[12px] text-[#F4B43C] hover:underline">插入编辑器</button></div>
                </div>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2 rounded-xl border border-white/10 bg-[#0E0F11]/60 px-3 py-2">
              <input disabled placeholder="问数据助手…（Enter 发送）" className="flex-1 bg-transparent text-[13px] text-white/40 outline-none placeholder:text-white/25" />
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-[#F4B43C] text-[#0E0F11]"><Send className="h-3.5 w-3.5" /></span>
            </div>
          </div>
        </div>
      </section>

      {/* COMPARISON */}
      <section id="compare" className="mx-auto max-w-[1180px] px-6 py-24">
        <div className="mb-10 max-w-xl">
          <div className="mb-3 font-mono text-[12px] uppercase tracking-widest text-[#F4B43C]">为什么选 DuckQuery</div>
          <h2 className="text-[2rem] font-semibold leading-tight tracking-tight md:text-[2.6rem]">补上数据库 GUI 和 BI 工具之间的空白。</h2>
          <p className="mt-4 max-w-lg text-white/55">数据库客户端碰不了你的本地文件;BI 工具又要先建仓、跑 ETL。DuckQuery 站在中间——文件和库一起查,AI 帮你写。</p>
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
        <p className="mt-4 font-mono text-[12px] text-white/30">基于 DuckDB 进程内分析引擎 —— 1 GB CSV 与远程表毫秒级 JOIN,无管道可维护。</p>
      </section>

      {/* QUICKSTART */}
      <section id="start" className="border-y border-white/[0.07] bg-[#16181C]/30">
        <div className="mx-auto grid max-w-[1180px] items-center gap-12 px-6 py-24 lg:grid-cols-[1fr_1.1fr]">
          <div>
            <div className="mb-3 font-mono text-[12px] uppercase tracking-widest text-[#F4B43C]">三分钟起跑</div>
            <h2 className="text-[2rem] font-semibold leading-tight tracking-tight md:text-[2.6rem]">一行命令,自托管。</h2>
            <p className="mt-5 max-w-md leading-relaxed text-white/55">Docker 一键拉起全栈(Python + React),即可读写本地文件、连真实数据库。想先看看?进工作台直接用。</p>
            <div className="mt-7 flex flex-wrap gap-3">
              <button onClick={onStartUsing} className="wp-btn rounded-xl bg-[#F4B43C] px-6 py-3 font-semibold text-[#0E0F11] hover:bg-[#FFD37A]">开始使用</button>
              <a href={GH} target="_blank" rel="noreferrer" className="wp-btn inline-flex items-center gap-2 rounded-xl border border-white/10 px-6 py-3 font-medium text-white/85 hover:bg-white/5"><Github className="h-4 w-4" /> GitHub</a>
            </div>
          </div>
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#16181C] shadow-[0_40px_90px_-50px_rgba(0,0,0,.9)]">
            <div className="flex h-10 items-center gap-2 border-b border-white/[0.07] bg-white/[0.02] px-4 font-mono text-[11px] text-white/35">
              <span className="h-2.5 w-2.5 rounded-full bg-white/15" /><span className="h-2.5 w-2.5 rounded-full bg-white/15" /><span className="h-2.5 w-2.5 rounded-full bg-white/15" /><span className="ml-2">terminal</span>
            </div>
            <pre className="overflow-x-auto px-5 py-5 font-mono text-[12.5px] leading-7 text-white/80"><span className="text-white/30">$</span> git clone https://github.com/Chenkeliang/duckdb-query.git{'\n'}<span className="text-white/30">$</span> cd duckdb-query && ./quick-start.sh{'\n'}<span className="text-[#F4B43C]">→ http://localhost:3000</span>  <span className="text-white/30">就绪<span className="wp-caret">▌</span></span></pre>
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute left-1/2 -top-32 h-96 w-96 -translate-x-1/2 rounded-full bg-[#F4B43C]/10 blur-[120px]" />
        <div className="relative mx-auto max-w-[1180px] px-6 py-28 text-center">
          <h2 className="mx-auto max-w-2xl text-[2.4rem] font-semibold leading-[1.05] tracking-tight md:text-[3.2rem]">把你散落的数据,<span className="text-[#F4B43C]">摆到一起查。</span></h2>
          <p className="mx-auto mt-5 max-w-2xl text-white/55 md:whitespace-nowrap">开源、自托管、数据不出本机。会 SQL 就能用,不会也有 AI 帮你写。</p>
          <div className="mt-9 flex flex-wrap justify-center gap-3">
            <button onClick={onStartUsing} className="wp-btn rounded-xl bg-[#F4B43C] px-7 py-3.5 font-semibold text-[#0E0F11] hover:bg-[#FFD37A]">开始使用</button>
            <a href={GH} target="_blank" rel="noreferrer" className="wp-btn inline-flex items-center gap-2 rounded-xl border border-white/10 px-7 py-3.5 font-medium text-white/85 hover:bg-white/5">在 GitHub 上 Star <ArrowRight className="h-4 w-4" /></a>
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
            <p className="max-w-xs text-[13px] leading-relaxed text-white/45">DuckDB 驱动的 AI 可视化 SQL 工作台。文件与数据库一站式跨源分析。</p>
          </div>
          <FooterCol title="产品" items={[['功能', '#features'], ['AI 问数', '#ai'], ['对比', '#compare']]} />
          <FooterCol title="资源" items={[['自托管', '#start'], ['文档', GH]]} />
          <FooterCol title="开源" items={[['GitHub', GH], ['MIT License', GH]]} />
        </div>
        <div className="border-t border-white/[0.07]">
          <div className="mx-auto flex max-w-[1180px] flex-wrap items-center justify-between gap-3 px-6 py-5 font-mono text-[12px] text-white/30">
            <span>© 2026 DuckQuery · MIT</span>
            <span>Built on DuckDB · 数据不出本机</span>
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
