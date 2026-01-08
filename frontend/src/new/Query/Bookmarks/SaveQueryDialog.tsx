import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

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
}

export const SaveQueryDialog: React.FC<SaveQueryDialogProps> = ({
    open,
    onOpenChange,
    sql,
}) => {
    const { t } = useTranslation('common');
    const { saveQuery, isSaving } = useSavedQueries();

    const [name, setName] = useState('');
    const [description, setDescription] = useState('');

    // Reset form when opening
    useEffect(() => {
        if (open) {
            setName('');
            setDescription('');
        }
    }, [open]);

    const handleSave = async () => {
        if (!name.trim()) return;

        try {
            await saveQuery({
                name,
                description,
                sql,
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
                    <DialogTitle>{t('query.bookmark.saveDialog.title')}</DialogTitle>
                    <DialogDescription>
                        {t('query.bookmark.saveDialog.description')}
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                        <Label htmlFor="name">{t('query.bookmark.saveDialog.name')}</Label>
                        <Input
                            id="name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder={t('query.bookmark.saveDialog.namePlaceholder')}
                        />
                    </div>

                    <div className="grid gap-2">
                        <Label htmlFor="description">{t('query.bookmark.saveDialog.descriptionLabel')}</Label>
                        <Textarea
                            id="description"
                            value={description}
                            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setDescription(e.target.value)}
                            placeholder={t('query.bookmark.saveDialog.descriptionPlaceholder')}
                            className="resize-none"
                        />
                    </div>
                    <div className="grid gap-2">
                        <Label>{t('query.bookmark.saveDialog.sqlPreview')}</Label>
                        <div className="text-xs font-mono bg-muted p-2 rounded border max-h-[100px] overflow-auto text-muted-foreground whitespace-pre-wrap">
                            {sql}
                        </div>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
                        {t('common.cancel')}
                    </Button>
                    <Button onClick={handleSave} disabled={isSaving || !name.trim()}>
                        {isSaving ? t('query.bookmark.saveDialog.saving') : t('query.bookmark.saveDialog.saveBtn')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
