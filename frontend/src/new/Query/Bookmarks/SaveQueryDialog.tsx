import React, { useState, useEffect } from 'react';

import { Button } from '@/new/components/ui/button';
import { Input } from '@/new/components/ui/input';
import { Label } from '@/new/components/ui/label';
import { Textarea } from '@/new/components/ui/textarea';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/new/components/ui/dialog';

import { useSavedQueries } from '../hooks/useSavedQueries';

interface SaveQueryDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    sql: string;
    type?: string;
}

export const SaveQueryDialog: React.FC<SaveQueryDialogProps> = ({
    open,
    onOpenChange,
    sql,
    type = 'duckdb',
}) => {

    const { saveQuery, isSaving } = useSavedQueries();

    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [queryType, setQueryType] = useState(type);

    // Reset form when opening
    useEffect(() => {
        if (open) {
            setName('');
            setDescription('');
            setQueryType(type);
        }
    }, [open, type]);

    const handleSave = async () => {
        if (!name.trim()) return;

        try {
            await saveQuery({
                name,
                description,
                sql,
                type: queryType,
                tags: []
            });
            onOpenChange(false);
        } catch (e) {
            // Error handling is done in the hook via toast
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>保存查询</DialogTitle>
                    <DialogDescription>
                        保存当前 SQL 查询以便稍后使用。
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                        <Label htmlFor="name">名称</Label>
                        <Input
                            id="name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="输入查询名称..."
                        />
                    </div>

                    <div className="grid gap-2">
                        <Label htmlFor="description">描述 (可选)</Label>
                        <Textarea
                            id="description"
                            value={description}
                            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setDescription(e.target.value)}
                            placeholder="添加描述..."
                            className="resize-none"
                        />
                    </div>
                    <div className="grid gap-2">
                        <Label>SQL 预览</Label>
                        <div className="text-xs font-mono bg-muted p-2 rounded border max-h-[100px] overflow-auto text-muted-foreground whitespace-pre-wrap">
                            {sql}
                        </div>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
                        取消
                    </Button>
                    <Button onClick={handleSave} disabled={isSaving || !name.trim()}>
                        {isSaving ? '保存中...' : '保存'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
