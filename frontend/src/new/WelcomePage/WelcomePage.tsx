import React from 'react';
import { Button } from '@/new/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/new/components/ui/card';
import { 
  BarChart3, 
  Link2, 
  Search, 
  Trash2, 
  Rocket, 
  Target,
  Github
} from 'lucide-react';

interface WelcomePageProps {
  onStartUsing: () => void;
}

const WelcomePage: React.FC<WelcomePageProps> = ({ onStartUsing }) => {
  return (
    <div className="min-h-screen bg-background font-sans leading-relaxed">
      {/* Hero Section */}
      <div className="bg-gradient-to-br from-indigo-600 to-purple-700 text-white text-center py-20 px-6 min-h-[60vh] flex items-center justify-center">
        <div className="max-w-3xl w-full">
          <h1 className="text-5xl font-bold mb-4 tracking-tight">
            DuckQuery · DuckDB
          </h1>
          <p className="text-2xl mb-3 opacity-95 font-medium">
            DuckDB 驱动的跨源数据可视化分析平台
          </p>
          <p className="text-lg mb-8 opacity-90 max-w-xl mx-auto">
            不建仓、不写脚本，Excel、CSV、数据库及 DuckDB SQL 统一处理，几分钟完成分析与导出
          </p>
          <Button 
            onClick={onStartUsing}
            size="lg"
            className="bg-white text-indigo-600 hover:bg-gray-100 font-semibold px-8 py-6 text-lg shadow-lg hover:shadow-xl transition-all hover:-translate-y-0.5"
          >
            开始使用 →
          </Button>
        </div>
      </div>

      {/* Pain Points Section */}
      <section className="py-20 px-6">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-4xl font-bold text-center mb-12 text-foreground">
            解决你的数据分析痛点
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-12">
            <FeatureCard
              title="多源数据直接关联"
              description="粘贴表格、上传文件、连接数据库，多种数据源快速转换为查询表。无需建库、无需ETL导入，直接JOIN关联分析。"
            />
            <FeatureCard
              title="图形化操作界面"
              description="页面点选数据源 → 设置关联条件，自动生成SQL执行。支持单表查询和多表关联，业务人员也能独立完成数据分析。"
            />
            <FeatureCard
              title="文件直接SQL查询"
              description="页面上传文件自动建表，DuckDB引擎让Excel、CSV、Parquet文件快速转换为可查询数据源。底层函数已封装，用户只需关注数据分析。"
            />
            <FeatureCard
              title="GB级文件分块处理"
              description="Excel打不开的超大文件，分块上传自动建表。DuckDB列式引擎让GB数据查询性能优异，解决大文件处理问题。"
            />
            <FeatureCard
              title="现代SQL专业支持"
              description="窗口函数、JSON处理、数组操作、递归查询全支持。CodeMirror编辑器智能补全，技术人员高效开发。"
            />
            <FeatureCard
              title="大查询后台运行"
              description="复杂分析提交后台执行，界面继续操作不阻塞。完成自动通知下载，支持CSV/Parquet导出。"
            />
          </div>
        </div>
      </section>

      {/* Comparison Section */}
      <section className="py-20 px-6 bg-muted/30">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-4xl font-bold text-center mb-12 text-foreground">
            Duck Query vs 传统方案
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mt-12">
            <ComparisonCard
              title="vs 文件导入分析"
              description="Excel: 50MB文件就卡顿，难以处理大数据。Duck Query: 支持GB级文件导入，查询计算速度快，完整数据可导出"
            />
            <ComparisonCard
              title="vs 多源数据关联"
              description="Excel: 需要手动VLOOKUP，操作繁琐。Duck Query: 图形化选择关联条件，跨源JOIN，简化数据整合"
            />
            <ComparisonCard
              title="vs 数据处理能力"
              description="Excel: 需要熟悉各种函数。Duck Query: 会SQL就可以分析数据，支持窗口函数、JSON处理"
            />
            <ComparisonCard
              title="vs 环境搭建"
              description="传统数据库: 安装配置数据库要半天。Duck Query: Docker一键部署3分钟"
            />
            <ComparisonCard
              title="vs 数据安全"
              description="云服务: 数据要上传有安全风险。Duck Query: 数据完全本地处理"
            />
            <ComparisonCard
              title="vs 数据仓库建设"
              description="传统方案: 需要建库建表等预处理。Duck Query: 直接导入分析，任意数据都可速成表，无需复杂预处理"
            />
          </div>
        </div>
      </section>

      {/* Use Cases Section */}
      <section className="py-20 px-6">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-4xl font-bold text-center mb-12 text-foreground">
            适用场景
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mt-12">
            <UseCaseCard
              icon={<BarChart3 className="w-6 h-6 text-white" />}
              title="Excel文件快速查询"
              description="销售数据Excel表格直接上传，无需导入数据库，立即开始SQL分析。支持GB级大文件分块上传，解决Excel处理大文件的问题。"
            />
            <UseCaseCard
              icon={<Link2 className="w-6 h-6 text-white" />}
              title="跨系统数据关联"
              description="MySQL业务系统 + Excel销售报表 + CSV库存数据，一个SQL语句JOIN关联分析，打通数据孤岛，整合多源数据。"
            />
            <UseCaseCard
              icon={<Search className="w-6 h-6 text-white" />}
              title="多表关联查询配置"
              description="业务人员通过图形界面选择表格、设置关联条件，自动生成复杂SQL查询，无需掌握编程技能。"
            />
            <UseCaseCard
              icon={<Trash2 className="w-6 h-6 text-white" />}
              title="SQL清洗GB级数据"
              description="大批量数据清洗和去重，DuckDB列式引擎高效处理，复杂数据操作快速完成。"
            />
            <UseCaseCard
              icon={<Rocket className="w-6 h-6 text-white" />}
              title="本地快速搭建环境"
              description="个人或小团队数据分析项目，Docker一键部署完整分析环境，本地运行安全可控。"
            />
            <UseCaseCard
              icon={<Target className="w-6 h-6 text-white" />}
              title="后台查询导出结果"
              description="大数据量分析任务提交后台执行，完成后自动生成文件下载，不影响其他工作进行。"
            />
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-6 bg-muted/30">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-4xl font-bold mb-4 text-foreground">
            立即体验 DuckQuery + DuckDB
          </h2>
          <p className="text-lg text-muted-foreground mb-8">
            开源免费，持续更新维护
          </p>
          <div className="flex gap-4 justify-center flex-wrap">
            <Button 
              onClick={onStartUsing}
              size="lg"
              className="font-semibold px-8 py-6 text-lg"
            >
              开始使用 →
            </Button>
            <Button 
              variant="outline"
              size="lg"
              className="font-semibold px-8 py-6 text-lg"
              asChild
            >
              <a 
                href="https://github.com/Chenkeliang/duckdb-query" 
                target="_blank" 
                rel="noopener noreferrer"
              >
                <Github className="w-5 h-5 mr-2" />
                查看源码 →
              </a>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
};

// Feature Card Component
interface FeatureCardProps {
  title: string;
  description: string;
}

const FeatureCard: React.FC<FeatureCardProps> = ({ title, description }) => (
  <Card className="border-border shadow-sm hover:shadow-lg transition-all hover:-translate-y-1">
    <CardHeader className="pb-3">
      <CardTitle className="text-xl font-semibold text-foreground">
        {title}
      </CardTitle>
    </CardHeader>
    <CardContent>
      <p className="text-muted-foreground leading-relaxed">
        {description}
      </p>
    </CardContent>
  </Card>
);

// Comparison Card Component
const ComparisonCard: React.FC<FeatureCardProps> = ({ title, description }) => (
  <Card className="border-border shadow-sm hover:shadow-lg transition-all hover:-translate-y-1">
    <CardHeader className="pb-3">
      <CardTitle className="text-xl font-semibold text-foreground">
        {title}
      </CardTitle>
    </CardHeader>
    <CardContent>
      <p className="text-muted-foreground leading-relaxed whitespace-pre-line">
        {description}
      </p>
    </CardContent>
  </Card>
);

// Use Case Card Component
interface UseCaseCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
}

const UseCaseCard: React.FC<UseCaseCardProps> = ({ icon, title, description }) => (
  <Card className="border-border shadow-sm hover:shadow-lg transition-all hover:-translate-y-1">
    <CardHeader className="pb-3">
      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-600 to-purple-700 flex items-center justify-center mb-4">
        {icon}
      </div>
      <CardTitle className="text-xl font-semibold text-foreground">
        {title}
      </CardTitle>
    </CardHeader>
    <CardContent>
      <p className="text-muted-foreground leading-relaxed">
        {description}
      </p>
    </CardContent>
  </Card>
);

export default WelcomePage;
