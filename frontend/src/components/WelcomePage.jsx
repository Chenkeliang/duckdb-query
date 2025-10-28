import React from 'react';
import './WelcomePage.css';

const WelcomePage = ({ onStartUsing }) => {
    return (
        <div className="welcome-container">
            <div className="welcome-hero">
                <div className="welcome-content">
                    <h1>DuckQuery · DuckDB</h1>
                    <p className="welcome-tagline">DuckDB 驱动的跨源数据可视化分析平台</p>
                    <p className="welcome-description">不建仓、不写脚本，Excel、CSV、数据库及 DuckDB SQL 统一处理，几分钟完成分析与导出</p>
                    <button className="welcome-cta-button" onClick={onStartUsing}>
                        开始使用 →
                    </button>
                </div>
            </div>

            <div className="welcome-section">
                <div className="welcome-container-inner">
                    <h2>解决你的数据分析痛点</h2>
                    <div className="welcome-grid-2">
                        <div className="welcome-feature-card">
                            <h3>多源数据直接关联</h3>
                            <p>粘贴表格、上传文件、连接数据库，多种数据源快速转换为查询表。无需建库、无需ETL导入，直接JOIN关联分析。</p>
                        </div>

                        <div className="welcome-feature-card">
                            <h3>图形化操作界面</h3>
                            <p>页面点选数据源 → 设置关联条件，自动生成SQL执行。支持单表查询和多表关联，业务人员也能独立完成数据分析。</p>
                        </div>

                        <div className="welcome-feature-card">
                            <h3>文件直接SQL查询</h3>
                            <p>页面上传文件自动建表，DuckDB引擎让Excel、CSV、Parquet文件快速转换为可查询数据源。底层函数已封装，用户只需关注数据分析。</p>
                        </div>

                        <div className="welcome-feature-card">
                            <h3>GB级文件分块处理</h3>
                            <p>Excel打不开的超大文件，分块上传自动建表。DuckDB列式引擎让GB数据查询性能优异，解决大文件处理问题。</p>
                        </div>

                        <div className="welcome-feature-card">
                            <h3>现代SQL专业支持</h3>
                            <p>窗口函数、JSON处理、数组操作、递归查询全支持。CodeMirror编辑器智能补全，技术人员高效开发。</p>
                        </div>

                        <div className="welcome-feature-card">
                            <h3>大查询后台运行</h3>
                            <p>复杂分析提交后台执行，界面继续操作不阻塞。完成自动通知下载，支持CSV/Parquet导出。</p>
                        </div>
                    </div>
                </div>
            </div>

            <div className="welcome-section welcome-bg-gray">
                <div className="welcome-container-inner">
                    <h2>Duck Query vs 传统方案</h2>
                    <div className="welcome-grid-3">
                        <div className="welcome-highlight-card">
                            <h3>vs 文件导入分析</h3>
                            <p>Excel: 50MB文件就卡顿，难以处理大数据<br />Duck Query: 支持GB级文件导入，查询计算速度快，完整数据可导出</p>
                        </div>

                        <div className="welcome-highlight-card">
                            <h3>vs 多源数据关联</h3>
                            <p>Excel: 需要手动VLOOKUP，操作繁琐<br />Duck Query: 图形化选择关联条件，跨源JOIN，简化数据整合</p>
                        </div>

                        <div className="welcome-highlight-card">
                            <h3>vs 数据处理能力</h3>
                            <p>Excel: 需要熟悉各种函数<br />Duck Query: 会SQL就可以分析数据，支持窗口函数、JSON处理</p>
                        </div>

                        <div className="welcome-highlight-card">
                            <h3>vs 环境搭建</h3>
                            <p>传统数据库: 安装配置数据库要半天<br />Duck Query: Docker一键部署3分钟</p>
                        </div>

                        <div className="welcome-highlight-card">
                            <h3>vs 数据安全</h3>
                            <p>云服务: 数据要上传有安全风险<br />Duck Query: 数据完全本地处理</p>
                        </div>

                        <div className="welcome-highlight-card">
                            <h3>vs 数据仓库建设</h3>
                            <p>传统方案: 需要建库建表等预处理<br />Duck Query: 直接导入分析，任意数据都可速成表，无需复杂预处理</p>
                        </div>
                    </div>
                </div>
            </div>

            <div className="welcome-section">
                <div className="welcome-container-inner">
                    <h2>适用场景</h2>
                    <div className="welcome-grid-3">
                        <div className="welcome-case-card">
                            <div className="welcome-case-icon icon-chart"></div>
                            <h3>Excel文件快速查询</h3>
                            <p>销售数据Excel表格直接上传，无需导入数据库，立即开始SQL分析。支持GB级大文件分块上传，解决Excel处理大文件的问题。</p>
                        </div>

                        <div className="welcome-case-card">
                            <div className="welcome-case-icon icon-link"></div>
                            <h3>跨系统数据关联</h3>
                            <p>MySQL业务系统 + Excel销售报表 + CSV库存数据，一个SQL语句JOIN关联分析，打通数据孤岛，整合多源数据。</p>
                        </div>

                        <div className="welcome-case-card">
                            <div className="welcome-case-icon icon-search"></div>
                            <h3>多表关联查询配置</h3>
                            <p>业务人员通过图形界面选择表格、设置关联条件，自动生成复杂SQL查询，无需掌握编程技能。</p>
                        </div>

                        <div className="welcome-case-card">
                            <div className="welcome-case-icon icon-clean"></div>
                            <h3>SQL清洗GB级数据</h3>
                            <p>大批量数据清洗和去重，DuckDB列式引擎高效处理，复杂数据操作快速完成。</p>
                        </div>

                        <div className="welcome-case-card">
                            <div className="welcome-case-icon icon-rocket"></div>
                            <h3>本地快速搭建环境</h3>
                            <p>个人或小团队数据分析项目，Docker一键部署完整分析环境，本地运行安全可控。</p>
                        </div>

                        <div className="welcome-case-card">
                            <div className="welcome-case-icon icon-target"></div>
                            <h3>后台查询导出结果</h3>
                            <p>大数据量分析任务提交后台执行，完成后自动生成文件下载，不影响其他工作进行。</p>
                        </div>
                    </div>
                </div>
            </div>

            <div className="welcome-section welcome-bg-gray">
                <div className="welcome-container-inner">
                    <div className="welcome-cta-section">
                        <h2>立即体验 DuckQuery + DuckDB</h2>
                        <p>开源免费，持续更新维护</p>
                        <div className="welcome-cta-buttons">
                            <button className="welcome-cta-button" onClick={onStartUsing}>开始使用 →</button>
                            <a href="https://github.com/Chenkeliang/duckdb-query" className="welcome-cta-button-secondary" target="_blank" rel="noopener noreferrer">
                                查看源码 →
                            </a>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default WelcomePage;
