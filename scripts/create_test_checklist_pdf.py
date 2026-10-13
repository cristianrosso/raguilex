from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import (
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "output" / "pdf"
OUT.mkdir(parents=True, exist_ok=True)
PDF_PATH = OUT / "raguilex_checklist_prueba_operativa.pdf"


def p(text, style):
    return Paragraph(text, style)


styles = getSampleStyleSheet()
styles.add(
    ParagraphStyle(
        name="TitleRX",
        parent=styles["Title"],
        fontName="Helvetica-Bold",
        fontSize=22,
        leading=26,
        textColor=colors.HexColor("#071B33"),
        spaceAfter=8,
    )
)
styles.add(
    ParagraphStyle(
        name="SectionRX",
        parent=styles["Heading2"],
        fontName="Helvetica-Bold",
        fontSize=13,
        leading=16,
        textColor=colors.HexColor("#1268F3"),
        spaceBefore=12,
        spaceAfter=6,
    )
)
styles.add(
    ParagraphStyle(
        name="BodyRX",
        parent=styles["BodyText"],
        fontName="Helvetica",
        fontSize=9.2,
        leading=12,
        textColor=colors.HexColor("#101828"),
    )
)
styles.add(
    ParagraphStyle(
        name="SmallRX",
        parent=styles["BodyText"],
        fontName="Helvetica",
        fontSize=8,
        leading=10,
        textColor=colors.HexColor("#667085"),
    )
)


def checklist_table(rows):
    data = [[p("OK", styles["SmallRX"]), p("Prueba", styles["SmallRX"]), p("Resultado / observacion", styles["SmallRX"])]]
    for row in rows:
        data.append(["[  ]", p(row, styles["BodyRX"]), ""])
    table = Table(data, colWidths=[1.2 * cm, 10.5 * cm, 5.0 * cm])
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#EAF3FF")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor("#071B33")),
                ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#D9E4F2")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F8FBFF")]),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )
    return table


story = [
    p("RAGUILEX - Checklist de Prueba Operativa", styles["TitleRX"]),
    p(
        "Guia breve para probar el sistema sin usar papel. Puedes abrir este PDF en el celular o en la computadora y marcar mentalmente cada punto.",
        styles["BodyRX"],
    ),
    Spacer(1, 8),
    p("Datos de acceso de prueba", styles["SectionRX"]),
    checklist_table(
        [
            "SUPER_ADMIN: superadmin / revisar SUPER_ADMIN_PASSWORD en tu .env local",
            "ADMIN: admin / revisar ADMIN_PASSWORD en tu .env local",
            "SELLER: vendedor / revisar SELLER_PASSWORD en tu .env local",
            "Web local: http://localhost:3002/login",
            "Web red local: http://192.168.0.16:3002/login",
        ]
    ),
    p("1. Login y roles", styles["SectionRX"]),
    checklist_table(
        [
            "Entrar como SUPER_ADMIN y verificar acceso a dashboard, usuarios, auditoria y ajustes.",
            "Entrar como ADMIN y verificar productos, alta rapida, inventario, ventas, caja, reportes y usuarios.",
            "Entrar como SELLER y verificar que solo vea inicio, ventas, escanear y perfil.",
            "Probar contrasena incorrecta y confirmar que no permite ingreso.",
            "Cerrar sesion y confirmar que no permite volver al dashboard sin login.",
        ]
    ),
    p("2. Alta rapida ADMIN", styles["SectionRX"]),
    checklist_table(
        [
            "Abrir Alta rapida.",
            "Confirmar que solo pide Marca, Talla, Color, Costo de compra y Precio de venta.",
            "Registrar ejemplo: Nike, 42, Blanco/Negro, 180, 450.",
            "Tomar o seleccionar fotografia JPEG/PNG/WEBP.",
            "Guardar y confirmar que genera codigo TN-XXXXX y queda AVAILABLE.",
            "Abrir ficha del producto y confirmar foto, precio, costo y QR.",
        ]
    ),
    p("3. Flujo SELLER - venta simple", styles["SectionRX"]),
    checklist_table(
        [
            "Entrar como vendedor.",
            "Abrir Escanear.",
            "Buscar por codigo TN del producto registrado.",
            "Confirmar que el vendedor ve marca, talla, color, precio y estado, pero NO costo ni utilidad.",
            "Crear nueva venta con metodo Efectivo.",
            "Confirmar venta y verificar pantalla de venta registrada.",
            "Intentar vender nuevamente el mismo producto y confirmar que lo bloquea.",
        ]
    ),
    p("4. Caja", styles["SectionRX"]),
    checklist_table(
        [
            "Entrar como ADMIN.",
            "Abrir caja con Bs 300.",
            "Registrar venta efectivo Bs 450.",
            "Registrar venta QR/Transferencia Bs 380.",
            "Registrar venta efectivo Bs 250.",
            "Registrar egreso efectivo Bs 50.",
            "Confirmar efectivo esperado: 300 + 450 + 250 - 50 = Bs 950.",
            "Cerrar con Bs 940 y confirmar que exige observacion por diferencia.",
        ]
    ),
    p("5. Reservas, devoluciones y anulaciones", styles["SectionRX"]),
    checklist_table(
        [
            "Reservar un producto AVAILABLE y verificar que cambia a RESERVED.",
            "Intentar vender producto reservado como vendedor y confirmar bloqueo.",
            "Liberar reserva como ADMIN y confirmar AVAILABLE.",
            "Vender un producto y registrar devolucion autorizada.",
            "Confirmar que la venta historica no se borra.",
            "Anular una venta como ADMIN y confirmar estado CANCELLED con motivo.",
        ]
    ),
    p("6. Reportes, auditoria y responsive", styles["SectionRX"]),
    checklist_table(
        [
            "Abrir Dashboard y confirmar que los totales cambian despues de ventas.",
            "Abrir Reportes y revisar ventas, utilidad, marcas y tallas.",
            "Abrir Auditoria como SUPER_ADMIN y confirmar eventos LOGIN, SALE, RETURN, CASH_OPEN/CLOSE.",
            "Probar en celular 390px: login, dashboard, alta rapida, scanner y venta sin zoom ni scroll horizontal.",
            "Confirmar que PWA/manifest abre con nombre RAGUILEX.",
        ]
    ),
    Spacer(1, 10),
    p(
        "Decision de prueba: si falla login, RBAC, doble venta, caja o ocultamiento de costo al vendedor, detener la prueba y corregir antes de usar en tienda.",
        styles["BodyRX"],
    ),
]

doc = SimpleDocTemplate(
    str(PDF_PATH),
    pagesize=A4,
    rightMargin=1.5 * cm,
    leftMargin=1.5 * cm,
    topMargin=1.4 * cm,
    bottomMargin=1.4 * cm,
)
doc.build(story)
print(PDF_PATH)
