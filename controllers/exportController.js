const Transaction = require('../models/Transaction');
const Project = require('../models/Project');
const User = require('../models/User');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');

exports.exportTransactions = async (req, res) => {
    try {
        const format = req.query.format || 'excel';
        const transactions = await Transaction.find({ userId: req.user._id })
            .sort({ createdAt: -1 })
            .limit(1000)
            .lean();

        if (format === 'pdf') {
            const doc = new PDFDocument({ margin: 30 });
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', 'attachment; filename=transactions.pdf');
            doc.pipe(res);

            doc.fontSize(18).text('DIBP Global — История транзакций', { align: 'center' });
            doc.moveDown();
            doc.fontSize(10).text(`Пользователь: ${req.user.fullName} (${req.user.userId})`);
            doc.text(`Дата экспорта: ${new Date().toLocaleString('ru-RU')}`);
            doc.moveDown();

            transactions.forEach(tx => {
                doc.fontSize(9)
                   .text(`${new Date(tx.createdAt).toLocaleString('ru-RU')} | ${tx.type} | ${tx.amount} ${tx.currency} | ${tx.status}`);
            });

            doc.end();
        } else {
            const workbook = new ExcelJS.Workbook();
            const sheet = workbook.addWorksheet('Транзакции');
            sheet.columns = [
                { header: 'Дата', key: 'date', width: 20 },
                { header: 'Тип', key: 'type', width: 15 },
                { header: 'Сумма', key: 'amount', width: 15 },
                { header: 'Валюта', key: 'currency', width: 10 },
                { header: 'Статус', key: 'status', width: 15 },
                { header: 'Описание', key: 'description', width: 40 }
            ];

            transactions.forEach(tx => {
                sheet.addRow({
                    date: new Date(tx.createdAt).toLocaleString('ru-RU'),
                    type: tx.type,
                    amount: tx.amount,
                    currency: tx.currency,
                    status: tx.status,
                    description: tx.description
                });
            });

            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', 'attachment; filename=transactions.xlsx');
            await workbook.xlsx.write(res);
        }
    } catch (e) {
        res.status(500).json({ success: false, message: 'Ошибка экспорта' });
    }
};

exports.exportProjects = async (req, res) => {
    try {
        const projects = await Project.find({ status: 'active' })
            .populate('initiator', 'userId fullName')
            .lean();

        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Проекты');
        sheet.columns = [
            { header: 'Название', key: 'title', width: 30 },
            { header: 'Категория', key: 'category', width: 15 },
            { header: 'Цель (ALTYN)', key: 'target', width: 15 },
            { header: 'Собрано (ALTYN)', key: 'collected', width: 15 },
            { header: 'Прогресс (%)', key: 'progress', width: 12 },
            { header: 'ROI (%)', key: 'roi', width: 10 },
            { header: 'Риск', key: 'risk', width: 10 },
            { header: 'Инициатор', key: 'initiator', width: 20 }
        ];

        projects.forEach(p => {
            sheet.addRow({
                title: p.title,
                category: p.category,
                target: p.targetAmount,
                collected: p.collectedAmount,
                progress: p.fundingProgress,
                roi: p.expectedROI,
                risk: p.riskLevel,
                initiator: p.initiator?.fullName || 'N/A'
            });
        });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=projects.xlsx');
        await workbook.xlsx.write(res);
    } catch (e) {
        res.status(500).json({ success: false, message: 'Ошибка экспорта' });
    }
};

exports.exportAdminData = async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Нет доступа' });
        }

        const workbook = new ExcelJS.Workbook();

        // Лист пользователей
        const usersSheet = workbook.addWorksheet('Пользователи');
        usersSheet.columns = [
            { header: 'ID', key: 'userId', width: 15 },
            { header: 'Имя', key: 'fullName', width: 25 },
            { header: 'Email', key: 'email', width: 30 },
            { header: 'Баланс', key: 'balance', width: 15 },
            { header: 'Активирован', key: 'isActivated', width: 12 },
            { header: 'Роль', key: 'role', width: 15 },
            { header: 'Дата регистрации', key: 'createdAt', width: 20 }
        ];

        const users = await User.find().lean();
        users.forEach(u => {
            usersSheet.addRow({
                userId: u.userId,
                fullName: u.fullName,
                email: u.email,
                balance: u.balance,
                isActivated: u.isActivated ? 'Да' : 'Нет',
                role: u.role,
                createdAt: new Date(u.createdAt).toLocaleString('ru-RU')
            });
        });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=admin_data.xlsx');
        await workbook.xlsx.write(res);
    } catch (e) {
        res.status(500).json({ success: false, message: 'Ошибка экспорта' });
    }
};