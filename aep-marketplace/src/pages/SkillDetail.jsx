import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';

const TIER_STYLES = {
  FREE:    { bg: 'bg-[#00F299]/10', text: 'text-[#00F299]', border: 'border-[#00F299]/30', label: 'FREE' },
  MICRO:   { bg: 'bg-cyan-500/10',   text: 'text-cyan-400',   border: 'border-cyan-500/30',   label: 'MICRO' },
  STARTER: { bg: 'bg-blue-500/10',   text: 'text-blue-400',   border: 'border-blue-500/30',   label: 'STARTER' },
  PRO:     { bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/30', label: 'PRO' },
  TEAM:    { bg: 'bg-orange-500/10', text: 'text-orange-400', border: 'border-orange-500/30', label: 'TEAM' },
};

export default function SkillDetail() {
  const { lang } = useLang();
  const c = CONTENT[lang] || CONTENT.en;

  const { id } = useParams();
  const [skill, setSkill] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');

  useEffect(() => {
    loadSkill();
  }, [id]);

  // Fetch Sentinel certificate when skill loads
  useEffect(() => {
    if (skill?.id) {
      loadCertificate(skill.id);
    }
  }, [skill?.id]);

  // Inject SEO + JSON-LD when skill loads
  useEffect(() => {
    if (skill) {
      const cleanup = injectSkillSeo(skill);
      return cleanup;
    }
  }, [skill]);

  const loadCertificate = async (skillId) => {
    setCertLoading(true);
    try {
      const res = await fetch(`/api/audit-skill?certificate=1&skillId=${encodeURIComponent(skillId)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.status === 'certified' && data.certificate) {
          setCertificate(data.certificate);
        } else {
          setCertificate(null);
        }
      } else {
        setCertificate(null);
      }
    } catch {
      setCertificate(null);
    } finally {
      setCertLoading(false);
    }
  };

  const loadSkill = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/skills.json');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const all = await res.json();
      const found = all.find(s => s.id === id);
      if (!found) throw new Error('Skill not found');
      setSkill(found);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text, key) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(''), 2000);
    });
  };

  const tier = skill?.tier || 'STARTER';
  const tierStyle = TIER_STYLES[tier] || TIER_STYLES.STARTER;

  if (loading) {
    return (
      <div className="min-h-screen pt-24 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block w-10 h-10 border-2 border-[#00F299] border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-zinc-500 font-mono text-sm">Loading skill...</p>
        </div>
      </div>
    );
  }

  if (error || !skill) {
    return (
      <div className="min-h-screen pt-24 flex items-center justify-center">
        <div className="text-center">
          <div className="text-5xl mb-4">⚠️</div>
          <p className="text-red-400 font-mono text-sm mb-6">{error || 'Skill not found'}</p>
          <Link to="/registry" className="px-6 py-3 bg-[#00F299] text-black font-semibold rounded-xl hover:bg-[#00F299]/90 transition-all">
            ← BACK TO REGISTRY
          </Link>
        </div>
      </div>
    );
  }

  const mcpConfig = JSON.stringify(skill.doc?.mcpConfig || {}, null, 2);
  const installCmd = `npx -y @marketnow-registry/${skill.id}`;

  const isFree = !skill.price || skill.price === 0;
  // Free skills: prompt is unlocked by default
  const promptUnlocked = purchased || isFree;

  return (
    <div className="min-h-screen pt-24 pb-16">
      <div className="max-w-[1100px] mx-auto px-6">

        {/* Breadcrumb */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-8">
          <Link to="/registry" className="text-zinc-500 text-sm font-mono hover:text-[#00F299] transition-colors">
            ← REGISTRY
          </Link>
          <span className="text-zinc-700 mx-2">/</span>
          <span className="text-zinc-400 text-sm font-mono">{skill.id}</span>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

          {/* LEFT — Main Info */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="lg:col-span-2 space-y-6"
          >
            {/* Header Card */}
            <div className="premium-card p-8">
              <div className="flex items-start justify-between mb-6">
                <div className="text-5xl">{skill.icon || '🧩'}</div>
                <div className="flex items-center gap-2">
                  <span className={`px-3 py-1 rounded-lg text-xs font-mono font-bold tracking-wider border ${tierStyle.bg} ${tierStyle.text} ${tierStyle.border}`}>
                    {tier}
                  </span>
                  {skill.verified && (
                    <span className="px-3 py-1 rounded-lg text-xs font-mono bg-[#00F299]/10 text-[#00F299] border border-[#00F299]/20">
                      ✓ VERIFIED
                    </span>
                  )}
                </div>
              </div>

              <span className="px-2.5 py-1 rounded-md bg-white/5 text-[10px] font-mono text-zinc-500 tracking-wider border border-white/5 mb-4 inline-block">
                {(skill.category || 'General').toUpperCase()}
              </span>

              <h1 className="text-3xl font-bold text-white mb-3">{skill.name}</h1>
              <p className="text-[#00F299]/80 text-sm font-mono mb-4">{skill.tagline}</p>
              <p className="text-zinc-400 leading-relaxed">{skill.description}</p>

              {/* Time Saved Banner */}
              {skill.timeSaved && (
                <div className="mt-6 flex items-center gap-3 px-5 py-4 rounded-xl bg-[#00F299]/5 border border-[#00F299]/15">
                  <span className="text-2xl">⏱</span>
                  <div>
                    <div className="text-[#00F299] font-semibold text-sm">Save ~{skill.timeSaved} on average</div>
                    <div className="text-zinc-500 text-xs mt-0.5">Reported by agents using this skill in production</div>
                  </div>
                </div>
              )}
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'Rating',       value: `★ ${skill.rating || '0.0'}` },
                { label: 'Executions',   value: skill.executions || '0' },
                { label: 'Success Rate', value: `${skill.successRate?.toFixed(1) || '0.0'}%` },
                { label: 'Trust Score',  value: `${skill.trustScore || 0}%` },
              ].map(s => (
                <div key={s.label} className="premium-card py-4 px-5 text-center">
                  <div className="text-[10px] text-zinc-500 font-mono tracking-wider mb-1 uppercase">{s.label}</div>
                  <div className="text-white font-mono font-semibold text-lg">{s.value}</div>
                </div>
              ))}
            </div>

            {/* Install */}
            <div className="premium-card p-6">
              <h2 className="text-white font-semibold mb-4 flex items-center gap-2">
                <span className="text-[#00F299]">⚡</span> Quick Install
              </h2>
              <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-black/40 border border-white/5 font-mono text-sm text-zinc-300">
                <span className="text-zinc-600 select-none">$</span>
                <code className="flex-1">{installCmd}</code>
                <button
                  onClick={() => copyToClipboard(installCmd, 'install')}
                  className="text-zinc-600 hover:text-[#00F299] transition-colors text-xs"
                  title="Copy"
                >
                  {copied === 'install' ? '✓ COPIED' : 'COPY'}
                </button>
              </div>
              {skill.doc?.setup && (
                <pre className="mt-4 text-xs text-zinc-500 font-mono whitespace-pre-wrap leading-relaxed">
                  {skill.doc.setup}
                </pre>
              )}
            </div>

            {/* MCP Config */}
            {skill.doc?.mcpConfig && (
              <div className="premium-card p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-white font-semibold flex items-center gap-2">
                    <span className="text-[#00F299]">⚙️</span> MCP Configuration
                  </h2>
                  <button
                    onClick={() => copyToClipboard(mcpConfig, 'mcp')}
                    className="text-xs font-mono text-zinc-500 hover:text-[#00F299] transition-colors px-3 py-1.5 rounded-lg border border-white/5 hover:border-[#00F299]/30"
                  >
                    {copied === 'mcp' ? '✓ COPIED' : 'COPY JSON'}
                  </button>
                </div>
                <pre className="text-xs text-zinc-400 font-mono overflow-x-auto leading-relaxed bg-black/30 rounded-xl p-4 border border-white/5">
                  {mcpConfig}
                </pre>
              </div>
            )}
          </motion.div>

          {/* RIGHT — Purchase & Meta */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
            className="space-y-4"
          >
            {/* Price Card */}
            <div className="premium-card p-6">
              <div className="text-center mb-6">
                <div className={`text-5xl font-bold font-mono mb-1 ${tierStyle.text}`}>
                  {skill.price === 0 ? 'FREE' : `$${skill.price}`}
                </div>
                {skill.price > 0 && (
                  <div className="text-zinc-500 text-xs font-mono">USD · one-time license</div>
                )}
                {skill.price === 0 && (
                  <div className="text-zinc-500 text-xs font-mono">No credit card required</div>
                )}
              </div>

              {/* ROI Badge */}
              {skill.roi && (
                <div className="flex items-center justify-center gap-2 mb-6 px-4 py-2.5 rounded-xl bg-white/5 border border-white/5">
                  <span className="text-zinc-400 text-xs">Avg ROI</span>
                  <span className="text-[#00F299] font-mono font-bold">{skill.roi}</span>
                </div>
              )}

              <button className={`w-full py-4 font-bold rounded-xl transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] ${
                skill.price === 0
                  ? 'bg-[#00F299] text-black hover:bg-[#00F299]/90 shadow-lg shadow-[#00F299]/20'
                  : 'bg-[#00F299] text-black hover:bg-[#00F299]/90 shadow-lg shadow-[#00F299]/20'
              }`}>
                {skill.price === 0 ? 'INSTALL FREE →' : `GET FOR $${skill.price} →`}
              </button>

              <p className="text-center text-zinc-600 text-[11px] font-mono mt-3">
                Verified by MarketNow Sentinel
              </p>
            </div>

            {/* Skill Meta */}
            <div className="premium-card p-5 space-y-3">
              <h3 className="text-zinc-400 text-xs font-mono tracking-wider uppercase mb-3">Skill Info</h3>
              {[
                { label: 'Provider',   value: (skill.provider || '').replace(/_/g, ' ') },
                { label: 'Latency',    value: skill.latency || 'N/A' },
                { label: 'Skill ID',   value: skill.id },
              ].map(item => (
                <div key={item.label} className="flex justify-between items-start gap-2">
                  <span className="text-zinc-600 text-xs font-mono whitespace-nowrap">{item.label}</span>
                  <span className="text-zinc-300 text-xs font-mono text-right break-all">{item.value}</span>
                </div>
              ))}
              {skill.tags && (
                <div className="pt-2 flex flex-wrap gap-1.5">
                  {skill.tags.slice(0, 4).map(tag => (
                    <span key={tag} className="px-2 py-0.5 rounded bg-white/5 text-zinc-600 text-[10px] font-mono border border-white/5">
                      #{tag}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Benchmarks */}
            {skill.doc?.benchmarks && (
              <div className="premium-card p-5">
                <h3 className="text-zinc-400 text-xs font-mono tracking-wider uppercase mb-3">Benchmarks</h3>
                <div className="space-y-2">
                  {Object.entries(skill.doc.benchmarks).map(([k, v]) => (
                    <div key={k} className="flex justify-between">
                      <span className="text-zinc-600 text-xs font-mono">{k.replace(/_/g, ' ')}</span>
                      <span className="text-zinc-300 text-xs font-mono">{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <Link
              to="/registry"
              className="block text-center py-3 rounded-xl border border-white/10 text-zinc-400 text-sm hover:border-white/20 hover:text-white transition-all"
            >
              ← Back to Registry
            </Link>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
