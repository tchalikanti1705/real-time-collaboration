import { useState, useEffect } from 'react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area
} from 'recharts';
import { 
  Activity, 
  Users, 
  Zap, 
  Clock, 
  HardDrive, 
  AlertCircle,
  RefreshCw,
  Server
} from 'lucide-react';
import { motion } from 'framer-motion';

const MetricCard = ({ icon: Icon, label, value, unit, color, trend }) => (
  <motion.div 
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    className="metric-card p-4 rounded-lg border border-zinc-800 bg-zinc-900/30 hover:bg-zinc-900/50 transition-all"
  >
    <div className="flex items-center gap-2 mb-2">
      <div 
        className="w-8 h-8 rounded-lg flex items-center justify-center"
        style={{ backgroundColor: `${color}20` }}
      >
        <Icon className="w-4 h-4" style={{ color }} />
      </div>
      <span className="text-xs text-muted-foreground uppercase tracking-wide">{label}</span>
    </div>
    <div className="flex items-baseline gap-1">
      <span className="text-2xl font-heading font-bold">{value}</span>
      <span className="text-sm text-muted-foreground">{unit}</span>
    </div>
  </motion.div>
);

const MetricsDashboard = ({ metrics }) => {
  const [history, setHistory] = useState([]);

  // Keep history of metrics for charts
  useEffect(() => {
    if (metrics) {
      setHistory(prev => {
        const newHistory = [...prev, {
          time: new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          p50: metrics.p50_latency_ms,
          p95: metrics.p95_latency_ms,
          messages: metrics.messages_per_sec,
          connections: metrics.active_connections
        }];
        // Keep last 30 data points
        return newHistory.slice(-30);
      });
    }
  }, [metrics]);

  if (!metrics) return null;

  const formatUptime = (seconds) => {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  };

  return (
    <div className="p-4" data-testid="metrics-dashboard">
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
        <MetricCard
          icon={Users}
          label="Connections"
          value={metrics.active_connections}
          unit=""
          color="#10B981"
        />
        <MetricCard
          icon={Activity}
          label="Throughput"
          value={metrics.messages_per_sec.toFixed(1)}
          unit="msg/s"
          color="#3B82F6"
        />
        <MetricCard
          icon={Zap}
          label="P50 Latency"
          value={metrics.p50_latency_ms.toFixed(1)}
          unit="ms"
          color="#F59E0B"
        />
        <MetricCard
          icon={Clock}
          label="P95 Latency"
          value={metrics.p95_latency_ms.toFixed(1)}
          unit="ms"
          color="#8B5CF6"
        />
        <MetricCard
          icon={HardDrive}
          label="Doc Size"
          value={(metrics.total_doc_size_bytes / 1024).toFixed(1)}
          unit="KB"
          color="#EC4899"
        />
        <MetricCard
          icon={AlertCircle}
          label="Errors"
          value={metrics.error_count}
          unit=""
          color="#EF4444"
        />
        <MetricCard
          icon={Server}
          label="Uptime"
          value={formatUptime(metrics.uptime_seconds)}
          unit=""
          color="#06B6D4"
        />
      </div>

      {/* Mini Charts */}
      {history.length > 1 && (
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 rounded-lg border border-zinc-800 bg-zinc-900/30">
            <h4 className="text-xs text-muted-foreground uppercase tracking-wide mb-3">Latency Over Time</h4>
            <ResponsiveContainer width="100%" height={100}>
              <AreaChart data={history}>
                <defs>
                  <linearGradient id="colorP50" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#F59E0B" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorP95" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis 
                  dataKey="time" 
                  tick={{ fontSize: 10, fill: '#71717a' }}
                  axisLine={{ stroke: '#27272a' }}
                  tickLine={false}
                />
                <YAxis 
                  tick={{ fontSize: 10, fill: '#71717a' }}
                  axisLine={{ stroke: '#27272a' }}
                  tickLine={false}
                  width={30}
                />
                <Tooltip 
                  contentStyle={{
                    backgroundColor: '#18181b',
                    border: '1px solid #27272a',
                    borderRadius: '6px',
                    fontSize: '12px'
                  }}
                />
                <Area 
                  type="monotone" 
                  dataKey="p50" 
                  stroke="#F59E0B" 
                  fillOpacity={1} 
                  fill="url(#colorP50)" 
                  name="P50 (ms)"
                />
                <Area 
                  type="monotone" 
                  dataKey="p95" 
                  stroke="#8B5CF6" 
                  fillOpacity={1} 
                  fill="url(#colorP95)" 
                  name="P95 (ms)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="p-4 rounded-lg border border-zinc-800 bg-zinc-900/30">
            <h4 className="text-xs text-muted-foreground uppercase tracking-wide mb-3">Throughput & Connections</h4>
            <ResponsiveContainer width="100%" height={100}>
              <LineChart data={history}>
                <XAxis 
                  dataKey="time" 
                  tick={{ fontSize: 10, fill: '#71717a' }}
                  axisLine={{ stroke: '#27272a' }}
                  tickLine={false}
                />
                <YAxis 
                  tick={{ fontSize: 10, fill: '#71717a' }}
                  axisLine={{ stroke: '#27272a' }}
                  tickLine={false}
                  width={30}
                />
                <Tooltip 
                  contentStyle={{
                    backgroundColor: '#18181b',
                    border: '1px solid #27272a',
                    borderRadius: '6px',
                    fontSize: '12px'
                  }}
                />
                <Line 
                  type="monotone" 
                  dataKey="messages" 
                  stroke="#3B82F6" 
                  strokeWidth={2}
                  dot={false}
                  name="msg/s"
                />
                <Line 
                  type="monotone" 
                  dataKey="connections" 
                  stroke="#10B981" 
                  strokeWidth={2}
                  dot={false}
                  name="Connections"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
};

export default MetricsDashboard;
