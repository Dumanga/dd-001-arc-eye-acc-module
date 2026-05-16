SELECT 'accountingjournalentry' AS t, COUNT(*) AS n FROM accountingjournalentry
UNION ALL SELECT 'accountingsupplierledgerentry', COUNT(*) FROM accountingsupplierledgerentry
UNION ALL SELECT 'accountingpaymentvoucherallocation', COUNT(*) FROM accountingpaymentvoucherallocation
UNION ALL SELECT 'accountingpaymentvoucher', COUNT(*) FROM accountingpaymentvoucher
UNION ALL SELECT 'accountinggoodsreturnline', COUNT(*) FROM accountinggoodsreturnline
UNION ALL SELECT 'accountinggoodsreturn', COUNT(*) FROM accountinggoodsreturn
UNION ALL SELECT 'accountinggoodsreceiptlineserial', COUNT(*) FROM accountinggoodsreceiptlineserial
UNION ALL SELECT 'accountinggoodsreceiptline', COUNT(*) FROM accountinggoodsreceiptline
UNION ALL SELECT 'accountinggoodsreceipt', COUNT(*) FROM accountinggoodsreceipt
UNION ALL SELECT 'accountingpurchaseorderline', COUNT(*) FROM accountingpurchaseorderline
UNION ALL SELECT 'accountingpurchaseorder', COUNT(*) FROM accountingpurchaseorder
UNION ALL SELECT 'accountinginvoiceline', COUNT(*) FROM accountinginvoiceline
UNION ALL SELECT 'accountinginvoice', COUNT(*) FROM accountinginvoice
UNION ALL SELECT 'accountingquotationline', COUNT(*) FROM accountingquotationline
UNION ALL SELECT 'accountingquotation', COUNT(*) FROM accountingquotation;
