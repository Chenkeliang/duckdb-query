import React, { useState, useEffect } from "react";
import Sidebar from "./new/Layout/Sidebar";
import { Home, Settings, Database } from "lucide-react";
import "./styles/tailwind.css";

const SidebarTest = () => {
    const [activeId, setActiveId] = useState("dashboard");
    const [isDarkMode, setIsDarkMode] = useState(false);

    // Apply theme class to body for global styles to work
    useEffect(() => {
        if (isDarkMode) {
            document.documentElement.classList.add("dark");
        } else {
            document.documentElement.classList.remove("dark");
        }
    }, [isDarkMode]);

    const navItems = [
        { id: "dashboard", label: "Dashboard", icon: Home },
        { id: "data", label: "Data Sources", icon: Database },
        { id: "settings", label: "Settings", icon: Settings },
    ];

    return (
        // We need a container that mimics the PageShell's layout context
        // Added dq-new-theme to trigger the scoped preflight (border resets etc.)
        <div className="dq-new-theme flex h-screen w-full bg-background text-foreground">
            <div className="w-64 border-r border-border bg-surface h-full">
                <Sidebar
                    navItems={navItems}
                    activeId={activeId}
                    onSelect={setActiveId}
                    isDarkMode={isDarkMode}
                    onToggleTheme={() => setIsDarkMode(!isDarkMode)}
                    locale="en"
                    onLocaleChange={() => console.log("Locale toggle")}
                    onOpenGithub={() => console.log("Github")}
                    onShowWelcome={() => console.log("Welcome")}
                    onSwitchLegacy={() => console.log("Legacy")}
                />
            </div>
            <div className="flex-1 p-8 bg-background">
                <h1 className="text-2xl font-bold mb-4">Sidebar Isolation Test</h1>
                <div className="p-4 border border-border rounded-lg bg-surface mb-4">
                    <p>Current Theme: <strong>{isDarkMode ? "Dark" : "Light"}</strong></p>
                    <p>Active Tab: <strong>{activeId}</strong></p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div className="h-20 bg-primary text-primary-foreground flex items-center justify-center rounded">Primary Class</div>
                    <div className="h-20 bg-muted text-muted-foreground flex items-center justify-center rounded">Muted Class</div>
                    <div className="h-20 border border-border flex items-center justify-center rounded">Border Class</div>
                    <div className="h-20 bg-surface-active flex items-center justify-center rounded">Surface Active Class</div>

                    {/* Inline Style Debugging */}
                    <div style={{ backgroundColor: 'var(--dq-primary)', color: 'white' }} className="h-20 flex items-center justify-center rounded">
                        Inline Var Primary
                    </div>
                    <div style={{ border: '5px solid var(--dq-border)' }} className="h-20 flex items-center justify-center rounded">
                        Inline Var Border (5px)
                    </div>
                </div>
            </div>
        </div>

    );
};

export default SidebarTest;
